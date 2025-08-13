// content.js

console.log("Sheet-My-Job: Content Script is running on this page.");

// 허용된 페이지(도메인/경로)에서만 동작하도록 가드
const ALLOWED_RULES = [
  { hostPattern: /(^|\.)wanted\.co\.kr$/ },
  // 필요 시 아래와 같이 추가 가능
  // { hostPattern: /(^|\.)saramin\.co\.kr$/ },
  // { hostPattern: /(^|\.)jobkorea\.co\.kr$/ },
];

function isAllowedPage() {
  try {
    const { hostname, pathname } = window.location;
    return ALLOWED_RULES.some((rule) => {
      const hostOk = rule.hostPattern.test(hostname);
      const pathOk = rule.pathPattern ? rule.pathPattern.test(pathname) : true;
      return hostOk && pathOk;
    });
  } catch {
    return false;
  }
}

const __SMJ_ALLOWED__ = isAllowedPage();
if (!__SMJ_ALLOWED__) {
  console.log("Sheet-My-Job: This page is not in the allowlist. Skipping.");
}
if (__SMJ_ALLOWED__) {
  console.log("SMJ: allowed page", {
    href: location.href,
    path: location.pathname,
  });
}

// 간단한 토스트 유틸리티
function ensureToastContainer() {
  if (document.getElementById("smj-toast-container")) return;
  const styleId = "smj-toast-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #smj-toast-container { position: fixed; top: 16px; right: 16px; z-index: 2147483647; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
      .smj-toast { min-width: 240px; max-width: 360px; color: #fff; padding: 10px 12px; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.18); font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; opacity: 0; transform: translateY(-8px); transition: opacity .2s ease, transform .2s ease; pointer-events: auto; }
      .smj-toast.show { opacity: 1; transform: translateY(0); }
      .smj-toast.success { background: #1f9d55; }
      .smj-toast.error { background: #d64545; }
    `;
    document.head.appendChild(style);
  }
  const container = document.createElement("div");
  container.id = "smj-toast-container";
  document.documentElement.appendChild(container);
}

function showToast(message, type = "success", durationMs = 2800) {
  try {
    ensureToastContainer();
    const container = document.getElementById("smj-toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `smj-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    const remove = () => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 200);
    };
    setTimeout(remove, durationMs);
    toast.addEventListener("click", remove);
  } catch (e) {
    // 페이지 보안정책 등으로 실패하더라도 기능에 영향 없도록 무시
  }
}

// 지원 완료 시점에서만 동작하도록 감지기 구성
if (__SMJ_ALLOWED__) {
  // 중복 실행 방지
  let hasTriggered = false;
  let lastTriggerAt = 0;
  const TRIGGER_COOLDOWN_MS = 5000;
  let lastJobIdTriggered = null;

  // 원티드 상세 페이지에서 정보 캐시
  const wantedContext = {
    jobId: null,
    jobUrl: null,
    company: null,
    title: null,
  };

  function extractWantedCompanyAndTitle() {
    const result = { company: null, title: null };
    try {
      const anchor = document.querySelector(
        "a[data-company-name][data-position-name]"
      );
      if (anchor) {
        const companyAttr = anchor.getAttribute("data-company-name");
        const positionAttr = anchor.getAttribute("data-position-name");
        result.company =
          (companyAttr || anchor.textContent || "").trim() || null;
        result.title = (positionAttr || "").trim() || null;
      }
      if (!result.company) {
        const companyEl = document.querySelector(
          '[data-qa="company-name"], [data-company], a[data-company-name]'
        );
        const companyAttr2 = companyEl?.getAttribute?.("data-company-name");
        result.company =
          (companyAttr2 || companyEl?.textContent || "").trim() || null;
      }
      if (!result.title) {
        const titleEl = document.querySelector('[data-qa="job-title"], h1');
        result.title =
          (titleEl?.textContent || document.title || "").trim() || null;
      }
    } catch {}
    return result;
  }

  function nowLocalDateTime() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
      now.getSeconds()
    )}`;
  }

  function sendToBackground(jobData) {
    chrome.runtime.sendMessage(
      {
        type: "SAVE_JOB_DATA",
        data: jobData,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Message sending failed:", chrome.runtime.lastError);
          showToast(
            `저장 실패: ${
              chrome.runtime.lastError.message || "메시지 전송 오류"
            }`,
            "error"
          );
          return;
        }
        if (!response) {
          showToast("저장 실패: 응답 없음", "error");
          return;
        }
        if (response.status === "에러") {
          console.error("Background error:", response.message);
          showToast(
            `저장 실패: ${response.message || "알 수 없는 오류"}`,
            "error"
          );
        } else {
          console.log("Background script responded:", response.status);
          showToast("저장 성공: 구글 시트에 기록되었습니다.", "success");
        }
      }
    );
  }

  function onApplyCompleted(source = "unknown") {
    const nowTs = Date.now();
    if (hasTriggered && nowTs - lastTriggerAt < TRIGGER_COOLDOWN_MS) return;
    hasTriggered = true;
    lastTriggerAt = nowTs;
    console.log(`SMJ: 지원 완료 감지됨 (source=${source})`);

    // TODO: 원티드 DOM에서 실제 회사/포지션을 추출하도록 개선 가능
    const fallback = extractWantedCompanyAndTitle();
    const jobData = {
      platform: "Wanted",
      company:
        (wantedContext.company && wantedContext.company.trim()) ||
        (fallback.company && fallback.company.trim()) ||
        "",
      title:
        (wantedContext.title && wantedContext.title.trim()) ||
        (fallback.title && fallback.title.trim()) ||
        "",
      date: nowLocalDateTime(),
      link:
        wantedContext.jobUrl ||
        window.location.href.replace(/\/(applied)([/?#].*)?$/, ""),
    };
    sendToBackground(jobData);
  }

  function captureWantedDetailContext() {
    try {
      const detailPattern = /^\/wd\/(\d+)(?:\/(?:applied))?(?:[\/?#]|$)/;
      const m = window.location.pathname.match(detailPattern);
      if (m) {
        const id = m[1];
        wantedContext.jobId = id;
        wantedContext.jobUrl = `${location.origin}/wd/${id}`;
        const extracted = extractWantedCompanyAndTitle();
        if (extracted.company) wantedContext.company = extracted.company;
        if (extracted.title) wantedContext.title = extracted.title;
      }
    } catch {}
  }

  // 1) URL 변경(완료 페이지) 감지: SPA 대응 (원티드 전용)
  (function interceptHistory() {
    const appliedPattern = /^\/wd\/(\d+)\/applied(?:[\/?#]|$)/;
    const detailPattern = /^\/wd\/(\d+)(?:[\/?#]|$)/;
    function checkUrl() {
      // 상세 페이지에 있을 때 컨텍스트 갱신
      captureWantedDetailContext();
      // 완료 페이지 진입 시 저장
      const m = window.location.pathname.match(appliedPattern);
      console.log("SMJ: checkUrl(history)", {
        pathname: location.pathname,
        matched: Boolean(m),
        id: m?.[1] || null,
      });
      if (m) {
        const id = m[1];
        wantedContext.jobId = id;
        wantedContext.jobUrl = `${location.origin}/wd/${id}`;
        onApplyCompleted("url-wanted");
        lastJobIdTriggered = id;
        return;
      }
      // 상세 페이지로 이동 시 다음 트리거를 위해 리셋
      const d = window.location.pathname.match(detailPattern);
      if (d && d[1] !== lastJobIdTriggered) {
        hasTriggered = false;
        console.log("SMJ: reset trigger for new detail page", d[1]);
      }
    }
    const pushState = history.pushState;
    const replaceState = history.replaceState;
    history.pushState = function () {
      const r = pushState.apply(this, arguments);
      setTimeout(checkUrl, 0);
      return r;
    };
    history.replaceState = function () {
      const r = replaceState.apply(this, arguments);
      setTimeout(checkUrl, 0);
      return r;
    };
    window.addEventListener("popstate", checkUrl);
    window.addEventListener("hashchange", checkUrl);
    // 초기 체크
    checkUrl();
  })();

  // 1-b) SPA에서 history monkey patch가 격리될 수 있어 주기적 경로 감시
  (function watchPathname() {
    const appliedPattern = /^\/wd\/(\d+)\/applied(?:[\/?#]|$)/;
    const detailPattern = /^\/wd\/(\d+)(?:[\/?#]|$)/;
    let lastPathname = location.pathname;
    setInterval(() => {
      const current = location.pathname;
      if (current === lastPathname) return;
      lastPathname = current;
      // 상세 정보 갱신 및 완료 감지
      captureWantedDetailContext();
      const m = current.match(appliedPattern);
      console.log("SMJ: checkUrl(poll)", {
        pathname: current,
        matched: Boolean(m),
        id: m?.[1] || null,
      });
      if (m) {
        const id = m[1];
        wantedContext.jobId = id;
        wantedContext.jobUrl = `${location.origin}/wd/${id}`;
        onApplyCompleted("url-wanted-poll");
        lastJobIdTriggered = id;
        return;
      }
      const d = current.match(detailPattern);
      if (d && d[1] !== lastJobIdTriggered) {
        hasTriggered = false;
        console.log("SMJ: reset trigger for new detail page (poll)", d[1]);
      }
    }, 400);
  })();
}
