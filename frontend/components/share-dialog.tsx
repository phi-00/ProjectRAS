"use client";

import { useState } from "react";
import { useEffect } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LoaderCircle, Link, Copy } from "lucide-react";
import { useCreateShare } from "@/lib/mutations/projects";
import { listShares, deleteShare } from "@/lib/projects";
import { useSession } from "@/providers/session-provider";
import { useProjectInfo } from "@/providers/project-provider";
import { useToast } from "@/hooks/use-toast";

export default function ShareDialog() {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [isValid, setIsValid] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const session = useSession();
  const { _id: pid } = useProjectInfo();
  const { toast } = useToast();

  const createShare = useCreateShare(session.user._id, pid as string, session.token);
  const [shares, setShares] = useState<any[]>([]);

  // Ensure component is mounted before rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        const s = await listShares({ uid: session.user._id, pid: pid as string, token: session.token });
        if (active) setShares(s);
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [open, pid, session.user._id, session.token]);

  useEffect(() => {
    if (open) {
      setToken(null);
    }
  }, [open, permission, expiresInDays]);

  function handleDaysChange(e: React.ChangeEvent<HTMLInputElement>){
    //(e) => setExpiresInDays(e.target.value ? Number(e.target.value) : undefined)} />
    const numberDays = e.target.value;
    setExpiresInDays(numberDays);

    setIsValid(numberDays === "" || /^\d+$/.test(numberDays) )
  }

  function handleCreate() {
    const days = expiresInDays === "" ? undefined : Number(expiresInDays);
    createShare.mutate(
      { permission, expiresInDays: days },
      {
        onSuccess: (t: any) => {
          setToken(t);
          toast({ title: "Share link created." });
        },
        onError: (err: any) =>
          toast({ title: "Error creating share", description: err.message, variant: "destructive" }),
      },
    );
  }

  function copyLink() {
    if (!token) return;
    const url = `${window.location.origin}/dashboard/${pid}?share=${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="inline-flex" variant="outline">
          <Link /> Share
        </Button>
      </DialogTrigger>
      {mounted && (
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Share Project</DialogTitle>
            <DialogDescription>Create a public link (requires login)</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <label className="text-sm">Permission</label>
            {mounted && (
              <Select value={permission} onValueChange={(v) => setPermission(v as "view" | "edit")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select permission" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View</SelectItem>
                  <SelectItem value="edit">Edit</SelectItem>
                </SelectContent>
              </Select>
            )}

            <label className="text-sm">Expires (days, optional)</label>
            <Input type="number" value={expiresInDays ?? ""} onChange={handleDaysChange} />
            {!isValid && (
              <p className="text-xs text-red-700 mt-2">Please enter a valid number of days.</p>
            )}

            {token && (
              <div className="flex items-center gap-2">
                <Input readOnly value={`${window.location.origin}/dashboard/${pid}?share=${token}`} />
                <Button onClick={copyLink}>
                  <Copy />
                </Button>
              </div>
            )}

            {shares.length > 0 && (
              <div className="mt-3">
                <label className="text-sm font-semibold">Existing shares</label>
                <div className="flex flex-col gap-2 mt-2">
                  {shares.map((s) => (
                    <div key={s.token} className="flex items-center justify-between gap-2">
                      <div className="text-xs">
                        <div>perm: {s.permission}</div>
                        <div>token: {s.token}</div>
                        {s.expires_at && <div>expires: {new Date(s.expires_at).toLocaleString()}</div>}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={async () => {
                            await navigator.clipboard.writeText(`${window.location.origin}/dashboard/${pid}?share=${s.token}`);
                            toast({ title: "Link copied" });
                          }}
                        >
                          <Copy />
                        </Button>
                        <Button
                          onClick={async () => {
                            try {
                              await deleteShare({ uid: session.user._id, pid: pid as string, token: session.token, shareToken: s.token });
                              setShares((prev) => prev.filter((x) => x.token !== s.token));
                              toast({ title: "Share removed" });
                            } catch (e: any) {
                              toast({ title: "Error removing share", description: e.message, variant: "destructive" });
                            }
                          }}
                          variant="destructive"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        <DialogFooter>
          <Button disabled={!isValid} onClick={handleCreate} className="inline-flex items-center gap-2">
            Create
            {createShare.isPending && <LoaderCircle className="size-[1em] animate-spin" />}
          </Button>
        </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
