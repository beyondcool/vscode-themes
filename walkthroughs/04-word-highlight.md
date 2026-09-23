## 启用单词高亮接管

主题负责配色，但「高亮选中单词 / 出现处」这件事的**行为逻辑**由扩展代码决定。

点击下面的链接应用：

[应用主题与推荐设置](command:zhouhe-dark.apply)

它会把颜色主题切到 `zhouhe-dark`，写入推荐设置，并：

- 关闭 VS Code 内置实现（`editor.selectionHighlight`、`editor.occurrencesHighlight`）
- 由 zhouhe-dark 自行绘制高亮，颜色取自主题自身的色键

想调整行为？打开设置搜索 `zhouhe-dark`：

- `highlightOnCursor`（默认 `false`）：只有光标、没有选区时**不**高亮
- `mode`：只在当前文件，还是连同所有已打开的文件
- `matchCase`（默认 `true`）：区分大小写，选中 `order` 不会高亮 `Order`
- `wholeWord`（默认 `always`）：全词匹配，`orderBook` 不会被高亮
- `minWordLength`：光标模式下最短高亮单词长度

> 触发条件：选区必须**正好等于一个完整单词**。光标停在单词中间不算，
> 选中 `orderB`、`order `、`rd` 也都不算。
- `currentStyle` / `matchStyle`：当前那处 / 其余出现处的配色

不再需要接管时：

[恢复 VS Code 内置高亮](command:zhouhe-dark.restoreHighlight)
