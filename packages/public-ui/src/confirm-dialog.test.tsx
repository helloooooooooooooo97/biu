import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { ConfirmDialog } from './confirm-dialog.tsx'

afterEach(() => cleanup())

test('confirm dialog uses the product overlay and explicit actions', () => {
  let result = ''
  render(
    <ConfirmDialog
      title="移除成员"
      message="该成员将无法继续访问空间。"
      confirmLabel="确认移除"
      danger
      onCancel={() => { result = 'cancel' }}
      onConfirm={() => { result = 'confirm' }}
    />,
  )

  const dialog = screen.getByRole('alertdialog')
  assert.equal(dialog.classList.contains('biu-confirm-dialog'), true)
  assert.match(dialog.textContent ?? '', /该成员将无法继续访问空间/)
  fireEvent.click(screen.getByText('确认移除'))
  assert.equal(result, 'confirm')
})

test('confirm dialog closes through its custom cancel action', () => {
  let cancelled = false
  render(
    <ConfirmDialog
      title="重新生成"
      message="旧配置会失效。"
      onCancel={() => { cancelled = true }}
      onConfirm={() => undefined}
    />,
  )
  fireEvent.click(screen.getByText('取消'))
  assert.equal(cancelled, true)
})
