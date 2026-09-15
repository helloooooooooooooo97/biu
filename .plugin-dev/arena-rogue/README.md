# 枪火

可全屏的窗口插件（`plugin-store-extras`，`shell.resizable: true`）。

## 操作

- **WASD** 移动
- **鼠标** 瞄准，**按住左键** 开火
- **Shift** 冲刺（无敌帧）
- **1–0 / Q E** 切换武器
- **R** 死后重开

清完一波会升级，三选一强化。



&nbsp;

```
function mergeSort(arr) {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));
  return merge(left, right);
}

function merge(left, right) {
  const result = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) result.push(left[i++]);
    else result.push(right[j++]);
  }
  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  return result;
}
```



&nbsp;

:::pageBlock {kind=code-run plugin=page-code-runner}
{
  "lang": "python",
  "code": "sdef merge_sort(arr):\n    if len(arr) <= 1:\n        return arr\n    mid = len(arr) // 2\n    return merge(merge_sort(arr[:mid]), merge_sort(arr[mid:]))\n\ndef merge(left, right):\n    result = []\n    i = j = 0\n    while i < len(left) and j < len(right):\n        if left[i] <= right[j]:\n            result.append(left[i]); i += 1\n        else:\n            result.append(right[j]); j += 1\n    return result + left[i:] + right[j:]\n\nprint(merge_sort([38, 27, 43, 3, 9, 82, 10]))",
  "height": 412,
  "outputHeight": 160
}
:::



:::pageBlock {kind=code-run plugin=page-code-runner}
{
  "lang": "python",
  "code": "def merge_sort(arr):\n    if len(arr) <= 1:\n        return arr\n    mid = len(arr) // 2\n    return merge(merge_sort(arr[:mid]), merge_sort(arr[mid:]))\n\ndef merge(left, right):\n    result = []\n    i = j = 0\n    while i < len(left) and j < len(right):\n        if left[i] <= right[j]:\n            result.append(left[i]); i += 1\n        else:\n            result.append(right[j]); j += 1\n    return result + left[i:] + right[j:]\n\nprint(merge_sort([38, 27, 43, 3, 9, 82, 10]))",
  "height": 506,
  "outputHeight": 160
}
:::



&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;