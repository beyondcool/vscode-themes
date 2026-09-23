# Change Log

All notable changes to the "vscode-themes" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [1.3.0]

- 只有在**选区正好等于一个完整单词**时才高亮：
  - 光标停在单词中间（无选区）不再高亮
  - 选区多/少一个字符（`orderB`、`order `、`rd`）一律不高亮
- `wordHighlight.highlightOnCursor` 默认改为 `false`
- `wordHighlight.wholeWord` 默认改为 `always`（`auto` 仍接受，与之等价）
- 光标模式（需手动打开 `highlightOnCursor`）同样遵守 `wholeWord` 设置

## [1.2.0]

- `wordHighlight.matchCase` 默认改为 `true`（区分大小写）
- `wordHighlight.wholeWord` 由布尔值改为三态 `auto` / `always` / `never`，默认 `auto`
- 双击选中整个单词时按**全词**匹配：`order` 不再命中 `orderBook`、`order_book`、`order2`
- 光标模式始终全词匹配
- 抽取 `getWordRangeAtPosition` 复用自定义分隔符逻辑

## [1.1.0]

- 新增扩展功能：接管「高亮选中单词 / 出现处」的逻辑（`extension.js`）
- 新增命令：`应用主题与推荐设置`、`开关「单词高亮接管」`、`恢复 VS Code 内置高亮`
- 新增设置：`zhouhe-dark.wordHighlight.*`、`zhouhe-dark.autoApplyOnThemeChange`
- 引导页新增「启用单词高亮接管」步骤
- `pkg_and_install.sh` 重写：自动选择 CLI、校验打包产物、打印已安装版本

## [1.0.0]

- Initial release
