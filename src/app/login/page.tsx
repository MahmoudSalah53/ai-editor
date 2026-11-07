"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button, Input, api } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ password }) });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[75vh] max-w-sm items-center px-4">
      <form onSubmit={submit} className="w-full space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Lock className="size-4" />
          </span>
          <div>
            <h1 className="text-base font-bold">تسجيل الدخول</h1>
            <p className="text-xs text-stone-500">أدخل كلمة مرور الاستوديو للمتابعة</p>
          </div>
        </div>

        <Input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="كلمة المرور"
          autoFocus
        />

        {error && <p className="text-xs text-danger">{error}</p>}

        <Button type="submit" loading={loading} className="w-full">
          دخول
        </Button>
      </form>
    </main>
  );
}
