import { useEffect, useRef } from "react";
import type { PublicConfig } from "../types";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        theme?: "light" | "dark" | "auto";
        callback: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
      }) => string;
      remove?: (widgetId: string) => void;
    };
  }
}

export function usesTurnstile(config: PublicConfig): boolean {
  return config.captcha?.provider === "turnstile" && Boolean(config.captcha.siteKey);
}

export function captchaReady(config: PublicConfig, token: string): boolean {
  return !usesTurnstile(config) || Boolean(token);
}

export function captchaFormReady(config: PublicConfig, token: string, form?: FormData): boolean {
  return usesTurnstile(config) ? Boolean(token) : String(form?.get("captchaText") ?? "").trim().toUpperCase() === "VIDA";
}

export function captchaPayload(config: PublicConfig, token: string, form?: FormData): Record<string, unknown> {
  return usesTurnstile(config) ? { captchaToken: token } : { captchaText: form?.get("captchaText") };
}

export function CaptchaField({
  config,
  onToken,
  helper = "Confirma que esta actualización fue enviada por una persona."
}: {
  config: PublicConfig;
  onToken: (token: string) => void;
  helper?: string;
}) {
  if (usesTurnstile(config) && config.captcha?.siteKey) {
    return (
      <section className="captchaField" aria-label="Verificación humana">
        <strong>Verificación humana</strong>
        <TurnstileWidget siteKey={config.captcha.siteKey} onToken={onToken} />
        <small>Requiere conexión para verificar antes de enviar.</small>
      </section>
    );
  }

  return (
    <label className="captchaField">
      Verificación humana
      <input name="captchaText" required autoComplete="off" inputMode="text" pattern="[Vv][Ii][Dd][Aa]" placeholder="Escribe VIDA" />
      <small>{helper}</small>
    </label>
  );
}

function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let widgetId: string | undefined;
    let stopped = false;
    onToken("");

    if (!document.getElementById("turnstile-api")) {
      const script = document.createElement("script");
      script.id = "turnstile-api";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const render = () => {
      if (stopped || widgetId || !containerRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "light",
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken("")
      });
    };
    const timer = window.setInterval(render, 200);
    render();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      if (widgetId) window.turnstile?.remove?.(widgetId);
      onToken("");
    };
  }, [onToken, siteKey]);

  return <div className="turnstileBox" ref={containerRef} />;
}
