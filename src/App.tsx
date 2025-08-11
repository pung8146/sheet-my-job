import { useState } from "react";
import "./App.css";

// 사용자 정보 객체의 타입을 정의합니다.
interface UserInfo {
  name: string;
  email: string;
}

function App() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string>("");
  const [sheetStatus, setSheetStatus] = useState<string>(""); // 시트 생성 상태를 추적

  // 시트를 생성하는 함수
  const createSheet = (token: string) => {
    setSheetStatus("스프레드시트를 확인하고 있습니다...");

    chrome.storage.local.get(["spreadsheetId"], (result) => {
      if (result.spreadsheetId) {
        setSheetStatus("스프레드시트가 이미 준비되었습니다.");
        return;
      }

      setSheetStatus("새로운 스프레드시트를 생성 중입니다...");
      fetch("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: { title: "Sheet-My-Job 지원 기록" },
        }),
      })
        .then((response) => response.json())
        .then((sheetData) => {
          if (sheetData.error) {
            throw new Error(sheetData.error.message);
          }
          const spreadsheetId = sheetData.spreadsheetId;
          chrome.storage.local.set({ spreadsheetId: spreadsheetId });

          const headers = [["플랫폼", "회사명", "지원일", "공고 링크"]];
          return fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ values: headers }),
            }
          );
        })
        .then((response) => response.json())
        .then((updateData) => {
          if (updateData.error) {
            throw new Error(updateData.error.message);
          }
          setSheetStatus("🎉 새로운 스프레드시트가 생성되었습니다!");
        })
        .catch((err) => {
          console.error("스프레드시트 생성 에러:", err);
          // 에러 메시지를 더 명확하게 변경
          setError("시트 생성에 실패했습니다: " + err.message);
          setSheetStatus("");
        });
    });
  };

  const handleLogin = () => {
    setError("");
    setSheetStatus("");

    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        setError(
          "로그인에 실패했습니다: " +
            (chrome.runtime.lastError.message || "Unknown error")
        );
        return;
      }

      if (!token) {
        setError("로그인에 실패했습니다: 토큰을 받아오지 못했습니다.");
        return;
      }

      const authToken = token as string;

      fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then((response) => response.json())
        .then((data: UserInfo) => {
          setUserInfo(data);
          createSheet(authToken);
        })
        .catch((err) => {
          console.error("사용자 정보 로딩 API 에러:", err);
          setError("사용자 정보 로딩에 실패했습니다: " + err.message);
        });
    });
  };

  // 진짜 로그아웃 기능 구현 (타입 에러 수정)
  const handleLogout = () => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        const authToken = token as string;
        // 1. 현재 토큰을 무효화합니다.
        fetch(`https://accounts.google.com/o/oauth2/revoke?token=${authToken}`);
        // 2. 크롬의 토큰 캐시를 지웁니다.
        chrome.identity.removeCachedAuthToken({ token: authToken }, () => {});
      }
      // 3. 앱의 상태를 초기화합니다.
      setUserInfo(null);
      setSheetStatus("");
      setError("");
    });
  };

  return (
    <div className="App">
      <h1>Sheet-My-Job</h1>
      <div className="card">
        {userInfo ? (
          <div>
            <p>환영합니다, {userInfo.name} 님!</p>
            <p>({userInfo.email})</p>
            {sheetStatus && <p className="status-message">{sheetStatus}</p>}
            <button onClick={handleLogout}>로그아웃</button>
          </div>
        ) : (
          <button onClick={handleLogin}>Google 계정으로 로그인</button>
        )}
        {error && <p className="error-message">{error}</p>}
      </div>
    </div>
  );
}

export default App;
