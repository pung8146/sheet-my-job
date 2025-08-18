// content.js

console.log("Sheet-My-Job: Content Script is running on this page.");

// 허용된 페이지(도메인/경로)에서만 동작하도록 가드
const ALLOWED_RULES = [
  { hostPattern: /(^|\.)wanted\.co\.kr$/ },
  { hostPattern: /(^|\.)saramin\.co\.kr$/ },
  // 필요 시 아래와 같이 추가 가능
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

  // 사람인 상세 페이지에서 정보 캐시
  const saraminContext = {
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
        result.title = (titleEl?.textContent || "").trim() || null;
      }
      if (!result.title) {
        const isAppliedPage = /^\/wd\/(\d+)\/applied(?:[\/?#]|$)/.test(
          location.pathname
        );
        if (!isAppliedPage) {
          const metaTitle = document
            .querySelector(
              'meta[property="og:title"], meta[name="twitter:title"]'
            )
            ?.getAttribute("content");
          result.title = (metaTitle || "").trim() || null;
        }
      }
    } catch {}
    return result;
  }

  function extractSaraminCompanyAndTitle() {
    const result = { company: null, title: null };
    try {
      // 사람인 채용공고 페이지에서 회사명 추출 시도
      const companySelectors = [
        ".company_nm",
        ".company-name",
        ".info_company .company",
        ".company_info .company_nm",
        "h2.company_nm",
        "[data-company-name]",
        ".company_area .company_nm",
      ];

      for (const selector of companySelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text =
            el.textContent?.trim() ||
            el.getAttribute("data-company-name")?.trim();
          if (text) {
            result.company = text;
            break;
          }
        }
      }

      // 사람인 채용공고 페이지에서 제목 추출 시도
      const titleSelectors = [
        ".job_tit",
        ".job-title",
        ".recruit_title",
        "h1.job_tit",
        ".title_job",
        ".job_title",
        "h1",
        "h2.job_tit",
      ];

      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent?.trim();
          if (text) {
            result.title = text;
            break;
          }
        }
      }

      // 메타 태그에서 추출 시도 (fallback)
      if (!result.title) {
        const metaTitle = document
          .querySelector(
            'meta[property="og:title"], meta[name="twitter:title"]'
          )
          ?.getAttribute("content");
        if (metaTitle) {
          result.title = metaTitle.trim();
        }
      }

      // URL에서 회사 정보 추출 시도 (fallback)
      if (!result.company) {
        const urlMatch = location.pathname.match(/\/company\/(\d+)/);
        if (urlMatch) {
          // 필요 시 회사 ID로 추가 정보 추출 로직 구현 가능
        }
      }
    } catch (e) {
      console.log("사람인 정보 추출 중 오류:", e);
    }
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

  function onApplyCompleted(source = "unknown", platform = "auto") {
    const nowTs = Date.now();
    if (hasTriggered && nowTs - lastTriggerAt < TRIGGER_COOLDOWN_MS) return;
    hasTriggered = true;
    lastTriggerAt = nowTs;
    console.log(
      `SMJ: 지원 완료 감지됨 (source=${source}, platform=${platform})`
    );

    // 플랫폼 자동 감지
    if (platform === "auto") {
      if (window.location.hostname.includes("wanted.co.kr")) {
        platform = "wanted";
      } else if (window.location.hostname.includes("saramin.co.kr")) {
        platform = "saramin";
      }
    }

    let jobData;

    if (platform === "saramin") {
      // 사람인 DOM에서 정확한 값 추출 시도
      const fallback = extractSaraminCompanyAndTitle();
      jobData = {
        platform: "사람인",
        company:
          (saraminContext.company && saraminContext.company.trim()) ||
          (fallback.company && fallback.company.trim()) ||
          "",
        title:
          (saraminContext.title && saraminContext.title.trim()) ||
          (fallback.title && fallback.title.trim()) ||
          "",
        date: nowLocalDateTime(),
        link: saraminContext.jobUrl || window.location.href,
      };
    } else {
      // 원티드 DOM에서 정확한 값 추출 시도 (상세 URL에서만 유효한 엘리먼트 대비 캐시 포함)
      const fallback = extractWantedCompanyAndTitle();
      jobData = {
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
    }

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
        // 상세 페이지에서 파싱한 값을 캐시하여 applied에서도 사용
        try {
          sessionStorage.setItem(
            `smj_wanted_${id}`,
            JSON.stringify({
              company: wantedContext.company || "",
              title: wantedContext.title || "",
              __savedAt: Date.now(),
            })
          );
        } catch {}
      }
    } catch {}
  }

  function captureSaraminDetailContext() {
    try {
      // 사람인 채용공고 상세 페이지 패턴 감지
      const detailPattern = /^\/zf_user\/jobs\/view\/([0-9a-zA-Z]+)/;
      const m = window.location.pathname.match(detailPattern);
      if (m) {
        const id = m[1];
        saraminContext.jobId = id;
        saraminContext.jobUrl = window.location.href.split("?")[0]; // 쿼리 파라미터 제거
        const extracted = extractSaraminCompanyAndTitle();
        if (extracted.company) saraminContext.company = extracted.company;
        if (extracted.title) saraminContext.title = extracted.title;

        // 사람인 상세 페이지에서 파싱한 값을 캐시
        try {
          sessionStorage.setItem(
            `smj_saramin_${id}`,
            JSON.stringify({
              company: saraminContext.company || "",
              title: saraminContext.title || "",
              __savedAt: Date.now(),
            })
          );
        } catch {}
      }
    } catch {}
  }

  // 1) URL 변경(완료 페이지) 감지: SPA 대응
  (function interceptHistory() {
    // 원티드 패턴
    const wantedAppliedPattern = /^\/wd\/(\d+)\/applied(?:[\/?#]|$)/;
    const wantedDetailPattern = /^\/wd\/(\d+)(?:[\/?#]|$)/;
    // 사람인 패턴 (지원 완료 감지)
    const saraminAppliedPattern = /^\/zf_user\/apply\/complete/;
    const saraminDetailPattern = /^\/zf_user\/jobs\/view\/([0-9a-zA-Z]+)/;

    function checkUrl() {
      // 플랫폼별 상세 페이지 컨텍스트 갱신
      if (window.location.hostname.includes("wanted.co.kr")) {
        captureWantedDetailContext();
      } else if (window.location.hostname.includes("saramin.co.kr")) {
        captureSaraminDetailContext();
      }

      // 원티드 완료 페이지 감지
      const wantedMatch = window.location.pathname.match(wantedAppliedPattern);
      console.log("SMJ: checkUrl(history) - wanted", {
        pathname: location.pathname,
        matched: Boolean(wantedMatch),
        id: wantedMatch?.[1] || null,
      });
      if (wantedMatch) {
        const id = wantedMatch[1];
        // applied 페이지에서는 상세 DOM이 비어있을 수 있으므로 직전 캐시 복구
        try {
          const cached = sessionStorage.getItem(`smj_wanted_${id}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.company) wantedContext.company = parsed.company;
            if (parsed?.title) wantedContext.title = parsed.title;
          }
        } catch {}
        wantedContext.jobId = id;
        wantedContext.jobUrl = `${location.origin}/wd/${id}`;
        onApplyCompleted("url-wanted", "wanted");
        lastJobIdTriggered = id;
        return;
      }

      // 사람인 완료 페이지 감지
      const saraminMatch = window.location.pathname.match(
        saraminAppliedPattern
      );
      console.log("SMJ: checkUrl(history) - saramin", {
        pathname: location.pathname,
        matched: Boolean(saraminMatch),
      });
      if (saraminMatch) {
        // Referrer나 세션에서 이전 채용공고 정보 복구
        try {
          const referrer = document.referrer;
          const referrerMatch = referrer.match(saraminDetailPattern);
          if (referrerMatch) {
            const id = referrerMatch[1];
            const cached = sessionStorage.getItem(`smj_saramin_${id}`);
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed?.company) saraminContext.company = parsed.company;
              if (parsed?.title) saraminContext.title = parsed.title;
              saraminContext.jobId = id;
              saraminContext.jobUrl = `${location.protocol}//${location.hostname}/zf_user/jobs/view/${id}`;
            }
          }
        } catch {}
        onApplyCompleted("url-saramin", "saramin");
        return;
      }

      // 상세 페이지로 이동 시 다음 트리거를 위해 리셋
      const wantedDetail = window.location.pathname.match(wantedDetailPattern);
      const saraminDetail =
        window.location.pathname.match(saraminDetailPattern);
      if (
        (wantedDetail && wantedDetail[1] !== lastJobIdTriggered) ||
        (saraminDetail && saraminDetail[1] !== lastJobIdTriggered)
      ) {
        hasTriggered = false;
        console.log(
          "SMJ: reset trigger for new detail page",
          wantedDetail?.[1] || saraminDetail?.[1]
        );
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
    // 원티드 패턴
    const wantedAppliedPattern = /^\/wd\/(\d+)\/applied(?:[\/?#]|$)/;
    const wantedDetailPattern = /^\/wd\/(\d+)(?:[\/?#]|$)/;
    // 사람인 패턴
    const saraminAppliedPattern = /^\/zf_user\/apply\/complete/;
    const saraminDetailPattern = /^\/zf_user\/jobs\/view\/([0-9a-zA-Z]+)/;

    let lastPathname = location.pathname;
    setInterval(() => {
      const current = location.pathname;
      if (current === lastPathname) return;
      lastPathname = current;

      // 플랫폼별 상세 정보 갱신
      if (window.location.hostname.includes("wanted.co.kr")) {
        captureWantedDetailContext();
      } else if (window.location.hostname.includes("saramin.co.kr")) {
        captureSaraminDetailContext();
      }

      // 원티드 완료 감지
      const wantedMatch = current.match(wantedAppliedPattern);
      console.log("SMJ: checkUrl(poll) - wanted", {
        pathname: current,
        matched: Boolean(wantedMatch),
        id: wantedMatch?.[1] || null,
      });
      if (wantedMatch) {
        const id = wantedMatch[1];
        try {
          const cached = sessionStorage.getItem(`smj_wanted_${id}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.company) wantedContext.company = parsed.company;
            if (parsed?.title) wantedContext.title = parsed.title;
          }
        } catch {}
        wantedContext.jobId = id;
        wantedContext.jobUrl = `${location.origin}/wd/${id}`;
        onApplyCompleted("url-wanted-poll", "wanted");
        lastJobIdTriggered = id;
        return;
      }

      // 사람인 완료 감지
      const saraminMatch = current.match(saraminAppliedPattern);
      console.log("SMJ: checkUrl(poll) - saramin", {
        pathname: current,
        matched: Boolean(saraminMatch),
      });
      if (saraminMatch) {
        // Referrer나 세션에서 이전 채용공고 정보 복구
        try {
          const referrer = document.referrer;
          const referrerMatch = referrer.match(saraminDetailPattern);
          if (referrerMatch) {
            const id = referrerMatch[1];
            const cached = sessionStorage.getItem(`smj_saramin_${id}`);
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed?.company) saraminContext.company = parsed.company;
              if (parsed?.title) saraminContext.title = parsed.title;
              saraminContext.jobId = id;
              saraminContext.jobUrl = `${location.protocol}//${location.hostname}/zf_user/jobs/view/${id}`;
            }
          }
        } catch {}
        onApplyCompleted("url-saramin-poll", "saramin");
        return;
      }

      // 상세 페이지로 이동 시 다음 트리거를 위해 리셋
      const wantedDetail = current.match(wantedDetailPattern);
      const saraminDetail = current.match(saraminDetailPattern);
      if (
        (wantedDetail && wantedDetail[1] !== lastJobIdTriggered) ||
        (saraminDetail && saraminDetail[1] !== lastJobIdTriggered)
      ) {
        hasTriggered = false;
        console.log(
          "SMJ: reset trigger for new detail page (poll)",
          wantedDetail?.[1] || saraminDetail?.[1]
        );
      }
    }, 400);
  })();
}
