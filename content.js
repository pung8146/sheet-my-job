// content.js

console.log("Sheet-My-Job: Content Script is running on this page.");

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

// 이 스크립트는 페이지가 로드될 때마다 실행됩니다.
// 지금은 테스트를 위해, 페이지의 아무 곳이나 클릭하면 메시지를 보내도록 설정합니다.
document.body.addEventListener("click", () => {
  console.log("A click was detected on the page.");

  // 나중에는 실제 지원 데이터를 추출해서 보낼 겁니다.
  const jobData = {
    platform: "Test Platform",
    company: "Test Company Inc.",
    title: "Frontend Developer",
    date: new Date().toISOString().split("T")[0],
    link: window.location.href,
  };

  // background.js로 메시지를 보냅니다.
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
});
