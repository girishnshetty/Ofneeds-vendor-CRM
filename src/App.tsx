import { useEffect, useState } from "react";
import { api } from "./client";
import type { User } from "./types";
import { Landing, AuthPage, HelpPage } from "./Public";
import Workspace from "./Workspace";
import { Skeleton } from "./ui";
import { AccountLinkPage, SupplierPortal } from "./Gateway";
export default function App() {
  const [path, setPath] = useState(location.pathname),
    [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const navigate = (url: string) => {
    history.pushState({}, "", url);
    setPath(url.split("?")[0]);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const pop = () => setPath(location.pathname);
    window.addEventListener("popstate", pop);
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>(
        "a[data-route]",
      );
      if (a && a.origin === location.origin && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        navigate(a.pathname + a.search);
      }
    };
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("popstate", pop);
      document.removeEventListener("click", click);
    };
  }, []);
  useEffect(() => {
    if (path.startsWith("/demo")) {
      setReady(true);
      return;
    }
    let alive = true;
    api("/api/auth/me")
      .then((r) => {
        if (alive) {
          setUser(r.user);
          setError("");
          setReady(true);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [path.startsWith("/demo")]);
  if (path === "/supplier-portal") return <SupplierPortal />;
  if (["/reset-password", "/verify-email", "/accept-invitation"].includes(path))
    return (
      <AccountLinkPage
        mode={path.slice(1)}
        onUser={(value) => {
          setUser(value);
          navigate("/dashboard");
        }}
      />
    );
  if (path.startsWith("/demo"))
    return (
      <Workspace
        key="demo"
        demo
        user={null}
        navigate={navigate}
        path={path}
        onLogout={() => {}}
      />
    );
  if (path === "/") return <Landing navigate={navigate} signedIn={!!user} />;
  if (path === "/help") return <HelpPage navigate={navigate} />;
  if (["/login", "/signup", "/forgot-password"].includes(path))
    return (
      <AuthPage
        key={path}
        mode={path.slice(1)}
        navigate={navigate}
        onUser={(value) => {
          setUser(value);
          navigate("/" + (value.preferences.defaultPage || "dashboard"));
        }}
      />
    );
  if (!ready) return <Skeleton />;
  if (error)
    return (
      <main className="fatal">
        <h1>Unable to connect</h1>
        <p>{error}</p>
        <button onClick={() => location.reload()}>Retry</button>
      </main>
    );
  if (!user)
    return (
      <AuthPage
        mode="login"
        navigate={navigate}
        onUser={(value) => {
          setUser(value);
          navigate(path);
        }}
      />
    );
  return (
    <Workspace
      key={user.id}
      demo={false}
      user={user}
      navigate={navigate}
      path={path}
      onLogout={async () => {
        await api("/api/auth/logout", "POST", {});
        setUser(null);
        navigate("/");
      }}
    />
  );
}
