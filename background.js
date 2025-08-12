// background.js

console.log("Sheet-My-Job: Background Script is running.");

// Helper function to get auth token
function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(
          new Error(
            "인증 토큰을 가져오는 데 실패했습니다. 팝업을 통해 먼저 로그인해야 할 수 있습니다."
          )
        );
      } else {
        resolve(token);
      }
    });
  });
}

// Helper function to get spreadsheet ID
function getSpreadsheetId() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["spreadsheetId"], (result) => {
      if (result.spreadsheetId) {
        resolve(result.spreadsheetId);
      } else {
        reject(
          new Error(
            "스프레드시트 ID를 찾을 수 없습니다. 팝업을 통해 먼저 로그인해주세요."
          )
        );
      }
    });
  });
}

// Helper function to append data to the sheet
async function appendToSheet(spreadsheetId, token, data) {
  const range = "A1"; // 시트의 첫 번째 빈 행에 데이터를 추가합니다.
  const valueInputOption = "USER_ENTERED";

  // 시트의 열 순서에 맞게 데이터를 배열로 포맷합니다.
  // [수정됨] data.title과 data.date의 순서를 바로잡았습니다.
  const values = [
    [
      data.platform,
      data.company,
      data.title, // 공고 제목
      data.date, // 지원일
      data.link, // 공고 링크
    ],
  ];

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=${valueInputOption}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: values }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.error.message || "시트에 데이터를 추가하는 데 실패했습니다."
    );
  }

  return await response.json();
}

// Main message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SAVE_JOB_DATA") {
    console.log("콘텐츠 스크립트로부터 데이터를 수신했습니다:", message.data);

    // async 함수를 사용하여 전체 흐름을 처리합니다.
    const saveData = async () => {
      try {
        const token = await getAuthToken();
        // 토큰 스코프를 로그로 확인
        try {
          const info = await fetch(
            `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`
          ).then((r) => r.json());
          console.log("Background token scopes:", info.scope);
        } catch (e) {
          console.warn("토큰 스코프 확인 실패", e);
        }
        const spreadsheetId = await getSpreadsheetId();
        await appendToSheet(spreadsheetId, token, message.data);
        sendResponse({ status: "성공! 데이터가 구글 시트에 저장되었습니다." });
      } catch (error) {
        console.error("데이터 저장 중 에러 발생:", error);
        sendResponse({ status: "에러", message: error.message });
      }
    };

    saveData();

    // 비동기 응답을 위해 true를 반환합니다.
    return true;
  }
});
