import { useState } from "react"
import { changePassword } from "../api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Eye, EyeOff, Loader2, KeyRound, CheckCircle2, AlertCircle } from "lucide-react"

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  visible: boolean
  onToggle: () => void
  autoComplete: string
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-1.5">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? "隐藏密码" : "显示密码"}
          className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  )
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  const reset = () => {
    setOldPassword("")
    setNewPassword("")
    setConfirm("")
    setShowOld(false)
    setShowNew(false)
    setShowConfirm(false)
    setLoading(false)
    setError("")
    setDone(false)
  }

  const handleOpenChange = (o: boolean) => {
    if (!o) reset()
    onOpenChange(o)
  }

  const submit = async () => {
    setError("")
    if (newPassword.length < 6) {
      setError("新密码至少 6 位字符")
      return
    }
    if (newPassword !== confirm) {
      setError("两次输入的新密码不一致")
      return
    }
    if (newPassword === oldPassword) {
      setError("新密码不能与当前密码相同")
      return
    }

    setLoading(true)
    try {
      await changePassword(oldPassword, newPassword)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "修改失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {done ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-chart-2/10">
              <CheckCircle2 className="size-7 text-chart-2" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">密码已更新</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                下次登录请使用新密码
              </p>
            </div>
            <Button onClick={() => handleOpenChange(false)} className="mt-2 w-full">
              完成
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" />
                修改密码
              </DialogTitle>
              <DialogDescription>验证当前密码后设置新的登录密码</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <PasswordField
                id="old-password"
                label="当前密码"
                value={oldPassword}
                onChange={setOldPassword}
                visible={showOld}
                onToggle={() => setShowOld((s) => !s)}
                autoComplete="current-password"
              />
              <PasswordField
                id="new-password"
                label="新密码"
                value={newPassword}
                onChange={setNewPassword}
                visible={showNew}
                onToggle={() => setShowNew((s) => !s)}
                autoComplete="new-password"
              />
              <PasswordField
                id="confirm-password"
                label="确认新密码"
                value={confirm}
                onChange={setConfirm}
                visible={showConfirm}
                onToggle={() => setShowConfirm((s) => !s)}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">至少 6 位字符</p>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={submit}
                disabled={loading || !oldPassword || !newPassword || !confirm}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    提交中…
                  </>
                ) : (
                  "确认修改"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
