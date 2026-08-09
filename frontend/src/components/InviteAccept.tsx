import { useEffect, useState } from "react"
import { inviteInfo, acceptInvite } from "../api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Users, ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react"

type State = "loading" | "ready" | "accepting" | "done" | "error"

export function InviteAccept({ token }: { token: string }) {
  const [workspaceName, setWorkspaceName] = useState("")
  const [state, setState] = useState<State>("loading")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    inviteInfo(token)
      .then((info) => {
        setWorkspaceName(info.workspace_name)
        setState("ready")
      })
      .catch(() => {
        setErrorMsg("邀请链接无效或已被撤销")
        setState("error")
      })
  }, [token])

  const handleAccept = async () => {
    setState("accepting")
    try {
      const res = await acceptInvite(token)
      setState("done")
      setTimeout(() => {
        window.location.hash = `/ws/${res.workspace_id}`
        window.location.reload()
      }, 1400)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "加入失败，请稍后重试")
      setState("error")
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div className="pointer-events-none fixed inset-0 bg-radial-glow" />
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-30" />

      {state === "done" ? (
        <Card className="glass-panel glow-border w-full max-w-sm animate-scale-in border-0 p-8 text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-chart-2/10">
            <CheckCircle2 className="size-7 text-chart-2" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">加入成功</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            正在进入「{workspaceName}」…
          </p>
          <div className="mx-auto mt-5 h-0.5 w-24 overflow-hidden rounded-full bg-chart-2/20">
            <div className="h-full animate-pulse rounded-full bg-chart-2" style={{ animationDuration: "1s" }} />
          </div>
        </Card>
      ) : state === "error" && !workspaceName ? (
        <Card className="glass-panel glow-border w-full max-w-sm animate-scale-in border-0 p-8 text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-7 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">邀请已失效</h2>
          <p className="mt-2 text-sm text-muted-foreground">{errorMsg}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-6"
            onClick={() => {
              window.location.hash = ""
              window.location.reload()
            }}
          >
            返回首页
          </Button>
        </Card>
      ) : state === "loading" ? (
        <Card className="glass-panel glow-border w-full max-w-sm animate-scale-in border-0">
          <CardHeader className="items-center text-center">
            <Skeleton className="mx-auto size-14 rounded-full" />
            <Skeleton className="mx-auto mt-4 h-5 w-28" />
            <Skeleton className="mx-auto mt-2 h-3 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-full rounded-md" />
          </CardContent>
          <CardFooter className="justify-center">
            <Skeleton className="h-3 w-16" />
          </CardFooter>
        </Card>
      ) : (
        <Card className="glass-panel glow-border w-full max-w-sm animate-scale-in border-0">
          <CardHeader className="items-center gap-0 text-center">
            <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10">
              <Users className="size-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">您被邀请加入工作区</p>
            <h2 className="mt-1.5 text-2xl font-bold tracking-tight accent-gradient-text">
              {workspaceName}
            </h2>
          </CardHeader>
          <CardContent>
            {state === "error" && (
              <Alert variant="destructive" className="mb-3">
                <AlertCircle className="size-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}
            <Button
              onClick={handleAccept}
              disabled={state === "accepting"}
              className="w-full gap-2"
              size="lg"
            >
              {state === "accepting" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  加入中…
                </>
              ) : (
                <>
                  加入工作区
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </CardContent>
          <CardFooter className="justify-center">
            <button
              onClick={() => {
                window.location.hash = ""
                window.location.reload()
              }}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              稍后再说
            </button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
