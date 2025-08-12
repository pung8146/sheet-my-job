// content.js

console.log("Sheet-My-Job: Content Script is running on this page.");

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
      } else {
        console.log("Background script responded:", response.status);
      }
    }
  );
});
