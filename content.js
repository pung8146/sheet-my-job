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
      #smj-toast-container { position: fixed; top: 20px; right: 20px; z-index: 2147483647; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
      .smj-toast { min-width: 280px; max-width: 400px; color: #fff; padding: 16px 20px; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.24); font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; opacity: 0; transform: translateY(-12px) scale(0.95); transition: all .3s cubic-bezier(0.4, 0, 0.2, 1); pointer-events: auto; cursor: pointer; border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(8px); }
      .smj-toast.show { opacity: 1; transform: translateY(0) scale(1); }
      .smj-toast.success { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
      .smj-toast.error { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }
      .smj-toast:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
    `;
    document.head.appendChild(style);
  }
  const container = document.createElement("div");
  container.id = "smj-toast-container";
  document.documentElement.appendChild(container);
}

function showToast(message, type = "success", durationMs = 4000) {
  try {
    ensureToastContainer();
    const container = document.getElementById("smj-toast-container");
    if (!container) {
      console.warn("SMJ: 토스트 컨테이너를 찾을 수 없음, 콘솔에 메시지 출력");
      console.log(`SMJ Toast: [${type.toUpperCase()}] ${message}`);
      return;
    }
    const toast = document.createElement("div");
    toast.className = `smj-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // 강제로 스타일 적용하여 토스트가 확실히 보이도록 함
    toast.style.cssText = `
      min-width: 280px;
      max-width: 400px;
      color: #fff;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.24);
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
      background: ${
        type === "error"
          ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
          : "linear-gradient(135deg, #10b981 0%, #059669 100%)"
      };
      position: relative;
      z-index: 2147483647;
      pointer-events: auto;
      opacity: 1;
      transform: translateY(0) scale(1);
      transition: all .3s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
      border: 1px solid rgba(255,255,255,0.2);
      backdrop-filter: blur(8px);
    `;

    requestAnimationFrame(() => toast.classList.add("show"));
    console.log(`SMJ Toast 표시: [${type.toUpperCase()}] ${message}`);

    const remove = () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-12px) scale(0.95)";
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 300);
    };
    setTimeout(remove, durationMs);
    toast.addEventListener("click", remove);
  } catch (e) {
    // 페이지 보안정책 등으로 실패하더라도 기능에 영향 없도록 무시하되 로그는 남김
    console.warn("SMJ: 토스트 표시 실패", e);
    console.log(`SMJ Toast Fallback: [${type.toUpperCase()}] ${message}`);
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
      console.log("SMJ: 사람인 정보 추출 시작", { url: location.href });

      // 사람인 채용공고 페이지에서 회사명 추출 시도
      const companySelectors = [
        "a.company", // 실제 확인된 셀렉터 - 최우선
        ".company_nm",
        ".company-name",
        ".info_company .company",
        ".company_info .company_nm",
        "h2.company_nm",
        "[data-company-name]",
        ".company_area .company_nm",
        ".basic_info .company_nm",
        ".recruit_company_info .company_nm",
        ".corp_name a",
        ".corp_name",
        ".company_name",
        ".name_company",
        "[class*='company']",
        "a[href*='/zf_user/company/']",
      ];

      for (const selector of companySelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text =
            el.textContent?.trim() ||
            el.getAttribute("data-company-name")?.trim();
          if (text) {
            result.company = text;
            console.log(`SMJ: 회사명 추출 성공 (${selector}):`, text);
            break;
          }
        }
      }

      if (!result.company) {
        console.log(
          "SMJ: 회사명 추출 실패, 사용한 셀렉터들:",
          companySelectors
        );
      }

      // 사람인 채용공고 페이지에서 제목 추출 시도
      const titleSelectors = [
        "h1.tit_job", // 실제 확인된 셀렉터 - 최우선
        ".job_tit",
        ".job-title",
        ".recruit_title",
        "h1.job_tit",
        ".title_job",
        ".job_title",
        "h1",
        "h2.job_tit",
        ".job_tit_lg",
        ".recruit_title h1",
        ".job_title_view",
        ".position_name",
        ".title_position",
        ".job_info_title",
        "[class*='job_tit']",
        "[class*='title']",
        ".content_job_title",
      ];

      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent?.trim();
          if (text) {
            result.title = text;
            console.log(`SMJ: 공고 제목 추출 성공 (${selector}):`, text);
            break;
          }
        }
      }

      if (!result.title) {
        console.log(
          "SMJ: 공고 제목 추출 실패, 사용한 셀렉터들:",
          titleSelectors
        );
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
          console.log("SMJ: 메타 태그에서 제목 추출 성공:", result.title);
        }
      }

      console.log("SMJ: 사람인 정보 추출 완료", result);

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
            `❌ 저장 실패: ${
              chrome.runtime.lastError.message || "메시지 전송 오류"
            }`,
            "error"
          );
          return;
        }
        if (!response) {
          showToast("❌ 저장 실패: 서버 응답 없음", "error");
          return;
        }
        if (response.status === "에러") {
          console.error("Background error:", response.message);
          showToast(
            `❌ 저장 실패: ${response.message || "알 수 없는 오류"}`,
            "error"
          );
        } else {
          console.log("Background script responded:", response.status);
          showToast(
            "🎉 사람인 지원 정보가 구글 시트에 성공적으로 저장되었습니다!",
            "success"
          );
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
      console.log("SMJ: 사람인 데이터 정리", {
        saraminContext,
        fallback,
        currentUrl: window.location.href,
      });

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

    console.log("SMJ: 최종 전송 데이터:", jobData);
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
      // 사람인 채용공고 상세 페이지 패턴 감지 (기존 패턴 + relay 패턴)
      const detailPattern =
        /^\/zf_user\/jobs\/(view\/([0-9a-zA-Z]+)|relay\/view)/;
      const m = window.location.pathname.match(detailPattern);
      if (m) {
        // relay URL의 경우 rec_idx 파라미터에서 ID 추출
        let id;
        if (m[1].startsWith("relay")) {
          const urlParams = new URLSearchParams(window.location.search);
          id = urlParams.get("rec_idx") || "relay_" + Date.now();
        } else {
          id = m[2];
        }

        saraminContext.jobId = id;
        saraminContext.jobUrl = window.location.href.split("#")[0]; // 앵커 제거
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
    const saraminDetailPattern =
      /^\/zf_user\/jobs\/(view\/([0-9a-zA-Z]+)|relay\/view)/;

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
        referrer: document.referrer,
      });
      if (saraminMatch) {
        // Referrer나 세션에서 이전 채용공고 정보 복구
        try {
          const referrer = document.referrer;
          console.log("SMJ: Referrer 분석 중:", referrer);

          const referrerMatch = referrer.match(saraminDetailPattern);
          if (referrerMatch) {
            // relay URL과 일반 URL 구분해서 ID 추출
            let id;
            if (referrerMatch[1] && referrerMatch[1].startsWith("relay")) {
              const urlParams = new URLSearchParams(
                referrer.split("?")[1] || ""
              );
              id = urlParams.get("rec_idx") || "relay_" + Date.now();
            } else {
              id = referrerMatch[2];
            }
            console.log("SMJ: Referrer에서 공고 ID 추출:", id);

            const cached = sessionStorage.getItem(`smj_saramin_${id}`);
            if (cached) {
              const parsed = JSON.parse(cached);
              console.log("SMJ: 캐시된 정보 복구:", parsed);
              if (parsed?.company) saraminContext.company = parsed.company;
              if (parsed?.title) saraminContext.title = parsed.title;
              saraminContext.jobId = id;
              saraminContext.jobUrl = `${location.protocol}//${location.hostname}/zf_user/jobs/view/${id}`;
            } else {
              console.log("SMJ: 캐시된 정보 없음, 기본값 설정");
              saraminContext.jobId = id;
              saraminContext.jobUrl = `${location.protocol}//${location.hostname}/zf_user/jobs/view/${id}`;
            }
          } else {
            console.log("SMJ: Referrer에서 공고 ID 추출 실패");
          }
        } catch (e) {
          console.log("SMJ: Referrer 처리 중 오류:", e);
        }
        onApplyCompleted("url-saramin", "saramin");
        return;
      }

      // 상세 페이지로 이동 시 다음 트리거를 위해 리셋
      const wantedDetail = window.location.pathname.match(wantedDetailPattern);
      const saraminDetail =
        window.location.pathname.match(saraminDetailPattern);
      if (wantedDetail && wantedDetail[1] !== lastJobIdTriggered) {
        hasTriggered = false;
        console.log("SMJ: reset trigger for new detail page", wantedDetail[1]);
      } else if (saraminDetail) {
        // 사람인의 경우 relay URL인지 확인
        let currentId;
        if (saraminDetail[1] && saraminDetail[1].startsWith("relay")) {
          const urlParams = new URLSearchParams(window.location.search);
          currentId = urlParams.get("rec_idx") || "relay_" + Date.now();
        } else {
          currentId = saraminDetail[2];
        }
        if (currentId !== lastJobIdTriggered) {
          hasTriggered = false;
          console.log(
            "SMJ: reset trigger for new saramin detail page",
            currentId
          );
        }
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
    const saraminDetailPattern =
      /^\/zf_user\/jobs\/(view\/([0-9a-zA-Z]+)|relay\/view)/;

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
            // relay URL과 일반 URL 구분해서 ID 추출
            let id;
            if (referrerMatch[1] && referrerMatch[1].startsWith("relay")) {
              const urlParams = new URLSearchParams(
                referrer.split("?")[1] || ""
              );
              id = urlParams.get("rec_idx") || "relay_" + Date.now();
            } else {
              id = referrerMatch[2];
            }

            const cached = sessionStorage.getItem(`smj_saramin_${id}`);
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed?.company) saraminContext.company = parsed.company;
              if (parsed?.title) saraminContext.title = parsed.title;
              saraminContext.jobId = id;
              // relay URL의 경우 원본 URL 보존
              if (referrerMatch[1] && referrerMatch[1].startsWith("relay")) {
                saraminContext.jobUrl = referrer.split("#")[0];
              } else {
                saraminContext.jobUrl = `${location.protocol}//${location.hostname}/zf_user/jobs/view/${id}`;
              }
            }
          }
        } catch {}
        onApplyCompleted("url-saramin-poll", "saramin");
        return;
      }

      // 상세 페이지로 이동 시 다음 트리거를 위해 리셋
      const wantedDetail = current.match(wantedDetailPattern);
      const saraminDetail = current.match(saraminDetailPattern);
      if (wantedDetail && wantedDetail[1] !== lastJobIdTriggered) {
        hasTriggered = false;
        console.log(
          "SMJ: reset trigger for new detail page (poll)",
          wantedDetail[1]
        );
      } else if (saraminDetail) {
        // 사람인의 경우 relay URL인지 확인
        let currentId;
        if (saraminDetail[1] && saraminDetail[1].startsWith("relay")) {
          const urlParams = new URLSearchParams(window.location.search);
          currentId = urlParams.get("rec_idx") || "relay_" + Date.now();
        } else {
          currentId = saraminDetail[2];
        }
        if (currentId !== lastJobIdTriggered) {
          hasTriggered = false;
          console.log(
            "SMJ: reset trigger for new saramin detail page (poll)",
            currentId
          );
        }
      }
    }, 400);
  })();

  // 2) DOM 내용(완료 메시지) 감지: MutationObserver
  (function observeApplyCompletionMessages() {
    // 사람인 지원 완료 메시지 패턴들
    const SARAMIN_SUCCESS_PATTERNS = [
      /입사지원\s*완료[!]?/i,
      /지원\s*완료[!]?/i,
      /지원이\s*완료[!]?/i,
      /지원서\s*제출\s*완료[!]?/i,
      /정상적으로\s*지원/i,
      /지원하였습니다[!]?/i,
      /지원서가\s*접수/i,
      /성공적으로\s*지원/i,
      /지원서\s*전송\s*완료[!]?/i,
      /지원\s*신청\s*완료[!]?/i,
      /이력서\s*제출\s*완료[!]?/i,
      /지원서\s*등록\s*완료[!]?/i,
      /지원\s*처리\s*완료[!]?/i,
      /입사지원.*완료/i,
      /지원.*완료/i,
      /이력서.*제출.*완료/i,
      /지원서.*전송.*성공/i,
      /입사지원이.*접수/i,
    ];

    // 원티드 지원 완료 메시지 패턴들
    const WANTED_SUCCESS_PATTERNS = [
      /지원\s*완료/i,
      /지원이\s*완료/i,
      /지원서\s*제출\s*완료/i,
      /정상적으로\s*지원/i,
      /지원하였습니다/i,
      /apply\s*completed/i,
      /application\s*submitted/i,
      /지원.*성공/i,
      /지원.*전송.*완료/i,
    ];

    function checkForSuccessMessage(element) {
      if (!element || !element.textContent) return false;

      const text = element.textContent.trim();
      if (!text) return false;

      const patterns = window.location.hostname.includes("saramin.co.kr")
        ? SARAMIN_SUCCESS_PATTERNS
        : WANTED_SUCCESS_PATTERNS;

      return patterns.some((pattern) => pattern.test(text));
    }

    function scanExistingElements() {
      // 페이지 로드 시 이미 존재하는 성공 메시지 확인
      const selectors = [
        // 사람인 가능한 성공 메시지 컨테이너들
        ".wrap_resume_layer", // 사람인 입사지원 완료 모달
        ".layer_popup", // 사람인 레이어 팝업
        ".popup_layer", // 사람인 팝업 레이어
        ".apply_layer", // 사람인 지원 레이어
        ".apply_complete", // 사람인 지원 완료
        ".alert",
        ".alert-success",
        ".success",
        ".complete",
        ".done",
        ".message",
        ".msg",
        ".notification",
        ".notice",
        ".popup",
        ".modal",
        ".modal-content",
        ".modal-body",
        ".toast",
        ".snackbar",
        // 원티드 가능한 성공 메시지 컨테이너들
        '[class*="success"]',
        '[class*="complete"]',
        '[class*="done"]',
        '[class*="message"]',
        '[class*="alert"]',
        '[class*="toast"]',
        '[class*="notification"]',
        '[class*="modal"]',
        '[class*="popup"]',
        '[class*="layer"]',
        '[class*="apply"]',
        // 범용 모달/다이얼로그 셀렉터
        '[role="dialog"]',
        '[role="alertdialog"]',
        // 가시성이 있는 오버레이들
        '[style*="display: block"]',
        '[style*="visibility: visible"]',
        // z-index가 높은 요소들 (모달일 가능성)
        '[style*="z-index"]',
      ];

      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            // 요소가 실제로 보이는지 확인
            if (isElementVisible(element) && checkForSuccessMessage(element)) {
              console.log(
                "SMJ: 기존 성공 메시지 발견:",
                element.textContent.trim(),
                "셀렉터:",
                selector
              );
              const platform = window.location.hostname.includes(
                "saramin.co.kr"
              )
                ? "saramin"
                : "wanted";
              onApplyCompleted("dom-existing", platform);
              return true;
            }
          }
        } catch (e) {
          console.warn("SMJ: 셀렉터 스캔 중 오류:", selector, e);
        }
      }
      return false;
    }

    // 요소가 실제로 화면에 보이는지 확인하는 함수
    function isElementVisible(element) {
      if (!element) return false;

      try {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.right > 0
        );
      } catch (e) {
        return true; // 오류 시에는 보이는 것으로 간주
      }
    }

    // MutationObserver로 새로 추가되는 요소들 감시
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // 새로 추가된 노드들 확인
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 추가된 요소가 보이는지 확인
            if (!isElementVisible(node)) continue;

            // 추가된 요소 자체가 성공 메시지인지 확인
            if (checkForSuccessMessage(node)) {
              console.log(
                "SMJ: 새로운 성공 메시지 감지:",
                node.textContent.trim()
              );
              const platform = window.location.hostname.includes(
                "saramin.co.kr"
              )
                ? "saramin"
                : "wanted";
              onApplyCompleted("dom-new", platform);
              return;
            }

            // 사람인 모달 특별 처리 (다양한 패턴)
            if (window.location.hostname.includes("saramin.co.kr")) {
              const modalSelectors = [
                ".wrap_resume_layer",
                ".layer_popup",
                ".popup_layer",
                ".apply_layer",
                ".apply_complete",
              ];

              for (const selector of modalSelectors) {
                if (
                  node.classList?.contains(selector.substring(1)) ||
                  node.querySelector?.(selector)
                ) {
                  console.log(`SMJ: 사람인 모달 감지 (${selector})`);

                  const modalContent = node.classList?.contains(
                    selector.substring(1)
                  )
                    ? node
                    : node.querySelector(selector);

                  if (modalContent && checkForSuccessMessage(modalContent)) {
                    console.log(
                      "SMJ: 사람인 모달에서 성공 메시지 확인:",
                      modalContent.textContent.trim()
                    );
                    onApplyCompleted("dom-saramin-modal", "saramin");
                    return;
                  }
                }
              }
            }

            // 원티드 모달 특별 처리
            if (window.location.hostname.includes("wanted.co.kr")) {
              const wantedModalPatterns = [
                /modal/i,
                /dialog/i,
                /popup/i,
                /overlay/i,
                /complete/i,
                /success/i,
              ];

              const nodeClassName = node.className || "";
              if (
                wantedModalPatterns.some((pattern) =>
                  pattern.test(nodeClassName)
                )
              ) {
                console.log("SMJ: 원티드 모달 감지:", nodeClassName);
                if (checkForSuccessMessage(node)) {
                  console.log(
                    "SMJ: 원티드 모달에서 성공 메시지 확인:",
                    node.textContent.trim()
                  );
                  onApplyCompleted("dom-wanted-modal", "wanted");
                  return;
                }
              }
            }

            // 추가된 요소의 하위 요소들도 확인 (모든 가시적 요소)
            try {
              const successElements =
                node.querySelectorAll && node.querySelectorAll("*");
              if (successElements) {
                for (const elem of successElements) {
                  if (isElementVisible(elem) && checkForSuccessMessage(elem)) {
                    console.log(
                      "SMJ: 새로운 성공 메시지 감지 (하위):",
                      elem.textContent.trim()
                    );
                    const platform = window.location.hostname.includes(
                      "saramin.co.kr"
                    )
                      ? "saramin"
                      : "wanted";
                    onApplyCompleted("dom-child", platform);
                    return;
                  }
                }
              }
            } catch (e) {
              console.warn("SMJ: 하위 요소 스캔 중 오류:", e);
            }
          }
        }

        // 텍스트 내용이 변경된 경우도 확인
        if (mutation.type === "characterData" && mutation.target.parentNode) {
          const parentElement = mutation.target.parentNode;
          if (
            isElementVisible(parentElement) &&
            checkForSuccessMessage(parentElement)
          ) {
            console.log(
              "SMJ: 텍스트 변경으로 성공 메시지 감지:",
              parentElement.textContent.trim()
            );
            const platform = window.location.hostname.includes("saramin.co.kr")
              ? "saramin"
              : "wanted";
            onApplyCompleted("dom-text-change", platform);
            return;
          }
        }

        // 속성 변경 감지 (display, visibility, opacity 등)
        if (mutation.type === "attributes") {
          const target = mutation.target;
          if (
            mutation.attributeName === "style" ||
            mutation.attributeName === "class"
          ) {
            // 요소가 새로 보이게 되었는지 확인
            if (isElementVisible(target) && checkForSuccessMessage(target)) {
              console.log(
                "SMJ: 속성 변경으로 성공 메시지 감지:",
                target.textContent.trim()
              );
              const platform = window.location.hostname.includes(
                "saramin.co.kr"
              )
                ? "saramin"
                : "wanted";
              onApplyCompleted("dom-attr-change", platform);
              return;
            }
          }
        }
      }
    });

    // 관찰 시작 (속성 변경도 포함)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    // 추가: 주기적으로 새로운 모달 체크 (일부 동적 모달이 감지되지 않을 경우 대비)
    let lastModalCheck = 0;
    const MODAL_CHECK_INTERVAL = 2000; // 2초마다

    const periodicModalCheck = () => {
      const now = Date.now();
      if (now - lastModalCheck < MODAL_CHECK_INTERVAL) return;
      lastModalCheck = now;

      // 높은 z-index를 가진 요소들 체크 (모달일 가능성)
      const highZIndexElements = Array.from(
        document.querySelectorAll("*")
      ).filter((el) => {
        try {
          const style = window.getComputedStyle(el);
          const zIndex = parseInt(style.zIndex);
          return zIndex > 999 && isElementVisible(el);
        } catch {
          return false;
        }
      });

      for (const element of highZIndexElements) {
        if (checkForSuccessMessage(element)) {
          console.log(
            "SMJ: 주기적 체크로 성공 메시지 감지:",
            element.textContent.trim(),
            "z-index:",
            window.getComputedStyle(element).zIndex
          );
          const platform = window.location.hostname.includes("saramin.co.kr")
            ? "saramin"
            : "wanted";
          onApplyCompleted("dom-periodic", platform);
          return;
        }
      }
    };

    // 주기적 체크 시작
    setInterval(periodicModalCheck, MODAL_CHECK_INTERVAL);

    // 페이지 로드 완료 후 기존 요소들 스캔
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        setTimeout(scanExistingElements, 1000);
      });
    } else {
      setTimeout(scanExistingElements, 1000);
    }

    // 3) 추가 모달 감지 메소드들

    // 포커스 이벤트 기반 모달 감지 (모달이 포커스를 받을 때)
    document.addEventListener("focusin", (event) => {
      const target = event.target;
      if (target && isElementVisible(target)) {
        // 포커스된 요소가 모달 내부에 있는지 확인
        const modalParent = target.closest(
          '[role="dialog"], [role="alertdialog"], .modal, .popup, .layer_popup, .wrap_resume_layer'
        );
        if (modalParent && checkForSuccessMessage(modalParent)) {
          console.log(
            "SMJ: 포커스 이벤트로 모달 감지:",
            modalParent.textContent.trim()
          );
          const platform = window.location.hostname.includes("saramin.co.kr")
            ? "saramin"
            : "wanted";
          onApplyCompleted("dom-focus", platform);
        }
      }
    });

    // 클릭 이벤트 후 모달 체크 (지원 버튼 클릭 후 모달이 나타날 수 있음)
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (
        target &&
        (target.textContent?.includes("지원") ||
          target.textContent?.includes("apply") ||
          target.textContent?.includes("Apply") ||
          target.className?.includes("apply") ||
          target.className?.includes("submit"))
      ) {
        // 클릭 후 잠시 후에 모달 체크
        setTimeout(() => {
          scanExistingElements();
        }, 500);

        setTimeout(() => {
          scanExistingElements();
        }, 1500);
      }
    });

    // 키보드 이벤트 (ESC 키나 Enter 키 후 모달 체크)
    document.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "Escape") {
        setTimeout(() => {
          scanExistingElements();
        }, 300);
      }
    });

    // 윈도우 포커스 변경 감지 (새 탭에서 돌아왔을 때 등)
    window.addEventListener("focus", () => {
      setTimeout(() => {
        scanExistingElements();
      }, 500);
    });

    // 스크롤 이벤트 (일부 모달이 스크롤 시 나타날 수 있음)
    let scrollTimeout;
    window.addEventListener("scroll", () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        scanExistingElements();
      }, 300);
    });

    console.log(
      "SMJ: 강화된 DOM 성공 메시지 감시 시작됨 (MutationObserver + 이벤트 기반 + 주기적 체크)"
    );
  })();
}
