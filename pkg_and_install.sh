#!/usr/bin/env bash
#
# 打包并安装 zhouhe-dark。
#
# 主题（contributes.themes）和扩展功能（extension.js）被打进同一个 .vsix，
# 所以一条命令就能把「主题 + 高亮接管逻辑」一起装进 VS Code。
#
set -euo pipefail

cd "$(dirname "$0")"

VSIX_NAME="zhouhe-dark.vsix"

# 选择一个可用的 CLI
if command -v code >/dev/null 2>&1; then
	CLI="code"
elif command -v code-insiders >/dev/null 2>&1; then
	CLI="code-insiders"
elif command -v codium >/dev/null 2>&1; then
	CLI="codium"
else
	echo "找不到 code / code-insiders / codium 命令，无法安装扩展。" >&2
	echo "请在 VS Code 里执行 Shell Command: Install 'code' command in PATH。" >&2
	exit 1
fi

echo "==> 使用 CLI: $CLI"

# 清掉旧产物
rm -f "$VSIX_NAME"

echo "==> 打包扩展（主题 + 扩展功能）"
npx --yes @vscode/vsce package -o "$VSIX_NAME"

if [ ! -f "$VSIX_NAME" ]; then
	echo "打包失败：没有生成 $VSIX_NAME" >&2
	exit 1
fi

echo "==> 安装 $VSIX_NAME（覆盖安装）"
"$CLI" --install-extension "$VSIX_NAME" --force

echo "==> 当前已安装版本"
"$CLI" --list-extensions --show-versions | grep -i 'zhouhe-dark' || true

echo
echo "完成。请重载 VS Code 窗口（Cmd/Ctrl+Shift+P → Reload Window），"
echo "然后执行命令面板中的「zhouhe-dark: 应用主题与推荐设置」。"
