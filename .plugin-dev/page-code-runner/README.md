# 代码运行块

在页面文档中插入可运行的多语言代码块：Python / JavaScript / TypeScript / Java / C / C++ / Go / Ruby / Swift / Perl / Bash。
编辑代码后点运行（或 Ctrl/Cmd+Enter），host 端编译执行，stdout / stderr 内联显示。

鼠标：代码区用 CodeMirror，点哪儿光标就落在哪儿（含只读模式，仍可点选复制）。工具条上的运行 / 清空 / 收起与拖动条都不会抢走光标。

高度：代码区与输出区默认**随内容自适应**，超过上限（代码 360px / 输出 280px）后内部滚动；拖动区块底部的拖动条可改高度，在拖动条上**双击**恢复自适应。工具条最左侧的 ▾ / ▸ 可**收起 / 展开**整块。

斜杠菜单输入 `code`、`run`、`代码运行` 即可插入。

## 示例写法

:::pageBlock {kind=code-run plugin=page-code-runner}
{
  "lang": "python",
  "code": "print('hello')"
}
:::

可写字段：`lang`（语言 id）、`code`（源码）、`codeH` / `outputH`（手动高度，null 表示自适应）、`collapsed`（是否收起）。
