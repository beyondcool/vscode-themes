// @ts-check
'use strict';

/**
 * zhouhe-dark 扩展功能入口。
 *
 * 主题部分（themes/ + configurationDefaults）负责配色，
 * 本文件负责「可执行逻辑」：接管 VS Code 高亮选中单词 / 出现处的行为。
 *
 * 生效条件：当前颜色主题是 zhouhe-dark，且 zhouhe-dark.wordHighlight.enabled 为 true。
 */

const vscode = require('vscode');

const SECTION = 'zhouhe-dark';
const THEME_ID = 'zhouhe-dark';

/** 「应用主题与推荐设置」会写入的用户级设置 */
const PROFILE_SETTINGS = {
	'editor.minimap.enabled': false,
	'editor.mouseWheelZoom': true,
	'editor.cursorSmoothCaretAnimation': 'on',
	'editor.semanticHighlighting.enabled': true,
	'workbench.experimental.modernUI': false,
};

/**
 * 被本扩展接管的内置设置：
 * 先关掉 VS Code 自带的实现，改由本扩展自行绘制，这样才能改「逻辑」。
 */
const BUILTIN_HIGHLIGHT_SETTINGS = {
	'editor.selectionHighlight': false,
	'editor.occurrencesHighlight': 'off',
};

/** 备份用户原有的内置设置，扩展停用时还原 */
const BACKUP_KEY = 'zhouhe-dark.builtinHighlight.backup';

/** 这些 scheme 的文档不参与高亮 */
const SKIPPED_SCHEMES = ['output', 'debug', 'vscode-scm', 'comment', 'walkThrough'];

/** @type {Record<string, string>} 样式名 -> 主题色键 */
const STYLE_COLORS = {
	selection: 'editor.selectionHighlightBackground',
	word: 'editor.wordHighlightBackground',
	strong: 'editor.wordHighlightStrongBackground',
	find: 'editor.findMatchHighlightBackground',
};

/** @type {vscode.ExtensionContext | undefined} */
let extensionContext;
/** @type {{ anchor: vscode.TextEditorDecorationType, word: vscode.TextEditorDecorationType } | undefined} */
let decorations;
/** @type {WordHighlightController | undefined} */
let controller;
/** 防止 applyProfile 重入（写设置会触发配置变更事件） */
let applying = false;

/* --------------------------------------------------------------- 配置读取 */

function getConfig() {
	const c = vscode.workspace.getConfiguration(SECTION);
	const styles = Object.keys(STYLE_COLORS);
	const pick = (key, fallback) => {
		const value = c.get(key, fallback);
		return styles.includes(/** @type {string} */ (value)) ? /** @type {string} */ (value) : fallback;
	};
	return {
		autoApply: c.get('autoApplyOnThemeChange', true),
		enabled: c.get('wordHighlight.enabled', true),
		mode: /** @type {string} */ (c.get('wordHighlight.mode', 'currentFile')) === 'openFiles' ? 'openFiles' : 'currentFile',
		onCursor: c.get('wordHighlight.highlightOnCursor', false),
		matchCase: c.get('wordHighlight.matchCase', true),
		wholeWord: normalizeWholeWord(c.get('wordHighlight.wholeWord', 'always')),
		minWordLength: c.get('wordHighlight.minWordLength', 2),
		maxResults: Math.max(1, c.get('wordHighlight.maxResults', 500)),
		maxDocumentLines: Math.max(1, c.get('wordHighlight.maxDocumentLines', 200000)),
		wordSeparators: c.get('wordHighlight.wordSeparators', ''),
		currentStyle: pick('wordHighlight.currentStyle', 'selection'),
		matchStyle: pick('wordHighlight.matchStyle', 'word'),
	};
}

/** 引擎是否生效：主题是 zhouhe-dark 且用户没有关掉接管 */
function isEngineActive() {
	return getConfig().enabled && isZhouheTheme();
}

function isZhouheTheme() {
	return vscode.workspace.getConfiguration('workbench').get('colorTheme') === THEME_ID;
}

/* ------------------------------------------------------------------ 工具 */

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 归一化 wholeWord 取值（兼容早期版本写下的布尔值）。
 * - 'always' / 'auto' 全词匹配（选区已要求是完整单词，两者等价）
 * - 'never'           关闭全词边界，允许匹配到更长单词的内部
 * @returns {'auto' | 'always' | 'never'}
 */
function normalizeWholeWord(value) {
	if (value === true) {
		return 'always';
	}
	if (value === false) {
		return 'never';
	}
	return value === 'always' || value === 'never' ? value : 'auto';
}

/**
 * 把字面量文本编成匹配正则源码。
 * wholeWord 仅在文本首尾都是「词字符」时才加前后断言，否则前缀/后缀会破坏匹配。
 *
 * 断言用 [\w$] 而不是 \b：这样 `order` 不会命中 `orderBook`、`order_book`、`order2`，
 * 只有当下一个字符是 `-`、`.`、`(`、空格等非词字符时才认为它是一个独立的单词。
 */
function buildPattern(text, wholeWord) {
	const escaped = escapeRegExp(text);
	if (wholeWord && /^[\w$]/.test(text) && /[\w$]$/.test(text)) {
		return `(?<![\\w$])${escaped}(?![\\w$])`;
	}
	return escaped;
}

/** 取 position 处的单词范围，支持自定义分隔符 */
function getWordRangeAtPosition(doc, position, cfg) {
	if (!cfg.wordSeparators) {
		return doc.getWordRangeAtPosition(position);
	}
	let separators;
	try {
		separators = new RegExp(`[${cfg.wordSeparators.replace(/[\\\]^-]/g, '\\$&')}]`);
	} catch {
		separators = undefined;
	}
	return separators ? doc.getWordRangeAtPosition(position, separators) : doc.getWordRangeAtPosition(position);
}

/** 文档文本缓存，避免每次光标移动都把整篇 getText() 一遍 */
const textCache = new Map();

function getDocumentText(doc) {
	const key = doc.uri.toString();
	const hit = textCache.get(key);
	if (hit && hit.version === doc.version) {
		return hit.text;
	}
	const text = doc.getText();
	textCache.set(key, { version: doc.version, text });
	if (textCache.size > 8) {
		const oldest = textCache.keys().next().value;
		if (oldest !== undefined && oldest !== key) {
			textCache.delete(oldest);
		}
	}
	return text;
}

/** 在文档里找出 pattern 的全部匹配范围 */
function findMatches(doc, pattern, cfg) {
	let re;
	try {
		re = new RegExp(pattern, cfg.matchCase ? 'g' : 'gi');
	} catch {
		return [];
	}
	const text = getDocumentText(doc);
	const ranges = [];
	let m;
	while ((m = re.exec(text)) !== null) {
		if (m[0].length === 0) {
			re.lastIndex += 1;
			continue;
		}
		ranges.push(new vscode.Range(doc.positionAt(m.index), doc.positionAt(m.index + m[0].length)));
		if (ranges.length >= cfg.maxResults) {
			break;
		}
	}
	return ranges;
}

/**
 * 决定「要匹配什么」。
 * - 有选区：选区必须「正好等于一个完整单词」才匹配（多/少一个字符都不行）
 * - 无选区：只有 highlightOnCursor 打开时才按光标所在单词匹配
 * @returns {{ pattern: string } | undefined}
 */
function buildQuery(editor, cfg) {
	const doc = editor.document;
	const sel = editor.selection;
	const wholeWord = cfg.wholeWord !== 'never';

	if (!sel.isEmpty) {
		const text = doc.getText(sel);
		if (!text || text.length > 200 || /[\r\n]/.test(text)) {
			return undefined;
		}
		// 选区必须正好是一个完整单词：
		// 选中 `order` → 高亮；选中 `orderB` / `order ` / `rd` → 一律不高亮
		const wordRange = getWordRangeAtPosition(doc, sel.start, cfg);
		if (!wordRange || !wordRange.isEqual(sel)) {
			return undefined;
		}
		return { pattern: buildPattern(text, wholeWord) };
	}

	if (!cfg.onCursor) {
		return undefined;
	}

	const wordRange = getWordRangeAtPosition(doc, sel.active, cfg);
	if (!wordRange) {
		return undefined;
	}

	const word = doc.getText(wordRange);
	if (!word || word.length < cfg.minWordLength) {
		return undefined;
	}
	return { pattern: buildPattern(word, wholeWord) };
}

/* -------------------------------------------------------------- 装饰绘制 */

function createDecorations(currentStyle, matchStyle) {
	/** @param {string} style */
	const make = (style, lane) =>
		vscode.window.createTextEditorDecorationType({
			backgroundColor: new vscode.ThemeColor(STYLE_COLORS[style] || STYLE_COLORS.word),
			borderColor: new vscode.ThemeColor('editor.selectionHighlightBorder'),
			borderWidth: '1px',
			borderStyle: 'solid',
			borderRadius: '2px',
			overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.selectionHighlightForeground'),
			overviewRulerLane: lane,
		});

	return {
		anchor: make(currentStyle, vscode.OverviewRulerLane.Right),
		word: make(matchStyle, vscode.OverviewRulerLane.Left),
	};
}

function recreateDecorations() {
	const cfg = getConfig();
	const previous = decorations;
	decorations = createDecorations(cfg.currentStyle, cfg.matchStyle);
	if (previous) {
		previous.anchor.dispose();
		previous.word.dispose();
	}
}

/* ------------------------------------------------------------------ 控制器 */

class WordHighlightController {
	constructor() {
		/** @type {Set<vscode.TextEditor>} */
		this.painted = new Set();
		this.refresh = this.refresh.bind(this);
	}

	/** 返回需要 push 进 subscriptions 的监听器 */
	listeners() {
		return [
			vscode.window.onDidChangeTextEditorSelection(() => this.refresh()),
			vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
			vscode.window.onDidChangeVisibleTextEditors(() => this.refresh()),
			vscode.workspace.onDidChangeTextDocument((e) => {
				const active = vscode.window.activeTextEditor;
				if (active && e.document === active.document) {
					this.refresh();
				}
			}),
		];
	}

	dispose() {
		this.clear();
	}

	clear() {
		if (!decorations) {
			return;
		}
		for (const editor of this.painted) {
			editor.setDecorations(decorations.anchor, []);
			editor.setDecorations(decorations.word, []);
		}
		this.painted.clear();
	}

	/** @param {vscode.TextDocument} doc */
	isSkipped(doc, cfg) {
		return SKIPPED_SCHEMES.includes(doc.uri.scheme) || doc.lineCount > cfg.maxDocumentLines;
	}

	refresh() {
		if (!decorations) {
			return;
		}
		const cfg = getConfig();
		const editor = vscode.window.activeTextEditor;

		if (!isEngineActive() || !editor || this.isSkipped(editor.document, cfg)) {
			this.clear();
			return;
		}

		const query = buildQuery(editor, cfg);
		if (!query) {
			this.clear();
			return;
		}

		const targets =
			cfg.mode === 'openFiles'
				? vscode.window.visibleTextEditors.filter((e) => !this.isSkipped(e.document, cfg))
				: [editor];
		if (!targets.includes(editor)) {
			targets.unshift(editor);
		}

		const anchorRange = editor.selection.isEmpty ? undefined : editor.selection;
		/** @type {Set<vscode.TextEditor>} */
		const next = new Set();

		for (const target of targets) {
			const anchor = [];
			const word = [];
			for (const range of findMatches(target.document, query.pattern, cfg)) {
				if (anchorRange && target.document === editor.document && range.intersection(anchorRange)) {
					anchor.push(range);
				} else {
					word.push(range);
				}
			}
			target.setDecorations(decorations.anchor, anchor);
			target.setDecorations(decorations.word, word);
			next.add(target);
		}

		// 清掉不再参与高亮的编辑器
		for (const old of this.painted) {
			if (!next.has(old)) {
				old.setDecorations(decorations.anchor, []);
				old.setDecorations(decorations.word, []);
			}
		}
		this.painted = next;
	}
}

/* ------------------------------------------------------------ 设置与命令 */

async function updateSetting(key, value) {
	try {
		await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
	} catch {
		// 某些设置在当前 VS Code 版本里可能不存在，忽略即可
	}
}

/**
 * 接管 / 归还 VS Code 内置的选中高亮。
 * 接管前记录用户原有的用户级取值，归还时写回（写 undefined 等于移除该项，回到默认）。
 * @param {boolean} enable
 */
async function setBuiltinHighlightTakenOver(enable) {
	if (!extensionContext) {
		return;
	}
	const cfg = vscode.workspace.getConfiguration();

	if (enable) {
		if (!extensionContext.globalState.get(BACKUP_KEY)) {
			/** @type {Record<string, unknown>} */
			const backup = {};
			for (const key of Object.keys(BUILTIN_HIGHLIGHT_SETTINGS)) {
				const info = cfg.inspect(key);
				backup[key] = info ? info.globalValue : undefined;
			}
			await extensionContext.globalState.update(BACKUP_KEY, backup);
		}
		for (const [key, value] of Object.entries(BUILTIN_HIGHLIGHT_SETTINGS)) {
			await updateSetting(key, value);
		}
		return;
	}

	const backup = extensionContext.globalState.get(BACKUP_KEY);
	for (const key of Object.keys(BUILTIN_HIGHLIGHT_SETTINGS)) {
		await updateSetting(key, backup ? backup[key] : undefined);
	}
	await extensionContext.globalState.update(BACKUP_KEY, undefined);
}

/** 应用主题 + 推荐设置，并让高亮接管与主题保持同步 */
async function applyProfile(options) {
	if (applying) {
		return;
	}
	applying = true;
	try {
		if (options.setTheme) {
			await updateSetting('workbench.colorTheme', THEME_ID);
		}
		for (const [key, value] of Object.entries(PROFILE_SETTINGS)) {
			await updateSetting(key, value);
		}
		await setBuiltinHighlightTakenOver(isEngineActive());
		controller?.refresh();
		if (options.verbose) {
			vscode.window.showInformationMessage('zhouhe-dark：主题、推荐设置与单词高亮逻辑已应用。');
		}
	} finally {
		applying = false;
	}
}

async function onConfigChanged(e) {
	if (e.affectsConfiguration('workbench.colorTheme')) {
		const cfg = getConfig();
		if (isZhouheTheme() && cfg.autoApply) {
			await applyProfile({ setTheme: false, verbose: false });
		} else {
			await setBuiltinHighlightTakenOver(isEngineActive());
		}
		controller?.refresh();
	}

	if (e.affectsConfiguration(`${SECTION}.wordHighlight`)) {
		recreateDecorations();
		await setBuiltinHighlightTakenOver(isEngineActive());
		controller?.refresh();
	}
}

async function commandToggleHighlight() {
	const cfg = vscode.workspace.getConfiguration(SECTION);
	const enabled = cfg.get('wordHighlight.enabled', true);
	await cfg.update('wordHighlight.enabled', !enabled, vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage(`zhouhe-dark：单词高亮接管已${enabled ? '关闭' : '开启'}。`);
}

async function commandRestoreBuiltin() {
	await vscode.workspace
		.getConfiguration(SECTION)
		.update('wordHighlight.enabled', false, vscode.ConfigurationTarget.Global);
	await setBuiltinHighlightTakenOver(false);
	vscode.window.showInformationMessage('zhouhe-dark：已关闭接管，并恢复 VS Code 内置的选中 / 出现处高亮。');
}

/* --------------------------------------------------------------- 生命周期 */

/** @param {vscode.ExtensionContext} context */
function activate(context) {
	extensionContext = context;

	recreateDecorations();
	controller = new WordHighlightController();

	context.subscriptions.push(
		vscode.commands.registerCommand('zhouhe-dark.apply', () => applyProfile({ setTheme: true, verbose: true })),
		vscode.commands.registerCommand('zhouhe-dark.restoreHighlight', () => commandRestoreBuiltin()),
		vscode.commands.registerCommand('zhouhe-dark.toggleWordHighlight', () => commandToggleHighlight()),
		vscode.workspace.onDidChangeConfiguration((e) => void onConfigChanged(e)),
		...controller.listeners(),
		{ dispose: () => controller?.dispose() },
		{
			dispose: () => {
				decorations?.anchor.dispose();
				decorations?.word.dispose();
				decorations = undefined;
			},
		}
	);

	// 启动时对齐一次：主题已是 zhouhe-dark 就直接接管（不写其它设置）
	void (async () => {
		if (isEngineActive()) {
			await setBuiltinHighlightTakenOver(true);
		}
		controller?.refresh();
	})();
}

async function deactivate() {
	try {
		controller?.dispose();
	} catch {
		// ignore
	}
	try {
		// 扩展被停用 / 卸载时把内置高亮还回去，避免「关了扩展就没高亮」
		await setBuiltinHighlightTakenOver(false);
	} catch {
		// ignore
	}
}

module.exports = { activate, deactivate };
