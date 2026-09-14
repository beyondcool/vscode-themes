## 确认语义高亮已开启

主题里针对语义 token（变量、函数、类型等）的配色，只有在 `editor.semanticHighlighting.enabled` 为 `true` 时才会渲染。

本扩展已经把它贡献为默认值 `true`；但如果你的 `settings.json` 里显式设置过这一项，则你的值优先。检查一下：

[打开语义高亮设置](command:workbench.action.openSettings?%5B%22editor.semanticHighlighting.enabled%22%5D)
