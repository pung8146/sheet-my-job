import { useEffect, useState } from "react";
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

  // [업그레이드됨] 구글 드라이브를 먼저 검색하고, 없으면 생성하는 함수
  const findOrCreateSheet = async (token: string) => {
    try {
      setSheetStatus("스프레드시트를 확인하고 있습니다...");

      const localResult = await new Promise<{ spreadsheetId?: string }>(
        (resolve) => {
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(["spreadsheetId"], (result) => {
              resolve(result as { spreadsheetId?: string });
            });
          } else {
            resolve({});
          }
        }
      );

      if (localResult && localResult.spreadsheetId) {
        // 저장된 스프레드시트 ID가 실제로 유효한지 확인합니다.
        try {
          const verifyResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${localResult.spreadsheetId}?fields=spreadsheetId`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (verifyResponse.ok) {
            setSheetStatus("저장된 스프레드시트를 찾았습니다.");
            return;
          }
          // 유효하지 않은 경우 스토리지에서 제거하고 계속 진행합니다.
          chrome.storage.local.remove("spreadsheetId");
          console.warn(
            "저장된 스프레드시트 ID가 유효하지 않아 제거했습니다. 새로 검색/생성합니다."
          );
        } catch (e) {
          // 네트워크/권한 오류 시에도 검색/생성 로직으로 진행
          console.warn(
            "스프레드시트 ID 검증 중 문제가 발생하여 계속 진행합니다.",
            e
          );
          chrome.storage.local.remove("spreadsheetId");
        }
      }

      setSheetStatus("Google Drive에서 기존 시트를 검색 중입니다...");
      const sheetName = "Sheet-My-Job 지원 기록";
      const query = `name='${sheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          query
        )}&fields=files(id,name)`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const searchData = await searchResponse.json();

      if (searchData.error)
        throw new Error(`Drive Search Error: ${searchData.error.message}`);

      if (searchData.files && searchData.files.length > 0) {
        const spreadsheetId = searchData.files[0].id;
        chrome.storage.local.set({ spreadsheetId });
        setSheetStatus("기존 스프레드시트를 찾아서 연결했습니다.");
        return;
      }

      setSheetStatus("새로운 스프레드시트를 생성 중입니다...");
      const createResponse = await fetch(
        "https://sheets.googleapis.com/v4/spreadsheets",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ properties: { title: sheetName } }),
        }
      );
      const sheetData = await createResponse.json();
      if (sheetData.error)
        throw new Error(`Sheet Creation Error: ${sheetData.error.message}`);

      const spreadsheetId = sheetData.spreadsheetId;
      chrome.storage.local.set({ spreadsheetId });

      const headers = [
        ["플랫폼", "회사명", "공고 제목", "지원일시", "공고 링크"],
      ];
      await fetch(
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

      setSheetStatus("🎉 새로운 스프레드시트가 생성되었습니다!");
    } catch (err: unknown) {
      // [수정됨] any 타입 대신 unknown 사용
      console.error("🚨 시트 처리 중 에러:", err);
      if (err instanceof Error) {
        setError("시트 처리 중 오류가 발생했습니다: " + err.message);
      } else {
        setError("시트 처리 중 알 수 없는 오류가 발생했습니다.");
      }
      setSheetStatus("");
    }
  };

  // [개선] 토큰 스코프를 반환하도록 변경 (공백 구분 배열)
  const checkTokenScopes = async (token: string): Promise<string[]> => {
    try {
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`
      );
      const data = await response.json();
      const scopes: string[] =
        typeof data.scope === "string" ? data.scope.split(" ") : [];
      console.log("✅ 현재 토큰이 가진 권한(Scopes):", scopes.join(", "));
      return scopes;
    } catch (err) {
      console.error("🚨 토큰 정보 확인 중 에러:", err);
      return [];
    }
  };

  // [신규] 팝업이 열릴 때 자동으로 기존 세션을 복구 (비대화형 토큰 사용)
  useEffect(() => {
    chrome.identity.getAuthToken({ interactive: false }, async (token) => {
      if (!token) return;

      const authToken = token as string;
      const scopes = await checkTokenScopes(authToken);
      const required = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/userinfo.email",
      ];
      const hasAllRequired = required.every((s) => scopes.includes(s));
      if (!hasAllRequired) {
        // 스코프가 부족하면 자동 복구를 시도하지 않음 (사용자가 로그인 버튼을 통해 재동의)
        console.warn("필수 스코프가 부족하여 자동 세션 복구 생략");
        return;
      }

      try {
        const userInfoResponse = await fetch(
          "https://www.googleapis.com/oauth2/v2/userinfo",
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        const userData: UserInfo = await userInfoResponse.json();
        setUserInfo(userData);
        // 저장된 시트가 유효하면 상태만 갱신, 없으면 검색/생성 수행
        await findOrCreateSheet(authToken);
      } catch (e) {
        console.warn("자동 세션 복구 중 문제 발생", e);
      }
    });
  }, []);

  // [개선] 스코프가 충분하면 기존 토큰을 재사용, 부족할 때만 재동의 유도
  const handleLogin = () => {
    console.log("🔵 handleLogin: 로그인 프로세스 시작.");
    setError("");
    setSheetStatus("");

    chrome.identity.getAuthToken(
      { interactive: false },
      async (existingToken) => {
        if (existingToken) {
          const authToken = existingToken as string;
          const scopes = await checkTokenScopes(authToken);
          const required = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/userinfo.email",
          ];
          const hasAllRequired = required.every((s) => scopes.includes(s));

          if (hasAllRequired) {
            try {
              const userInfoResponse = await fetch(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                { headers: { Authorization: `Bearer ${authToken}` } }
              );
              const userData: UserInfo = await userInfoResponse.json();
              setUserInfo(userData);
              await findOrCreateSheet(authToken);
              return;
            } catch (e) {
              console.warn("기존 토큰 사용 중 문제 -> 재동의 시도", e);
            }
          } else {
            console.log("필수 스코프 부족 -> 캐시 토큰 제거 후 재동의 요청");
            chrome.identity.removeCachedAuthToken({ token: authToken }, () => {
              requestNewAuthToken();
            });
            return;
          }
        }

        console.log(
          "🔵 handleLogin: 기존 토큰 없음 또는 사용 불가. 새로운 토큰 요청 시작."
        );
        requestNewAuthToken();
      }
    );
  };

  const requestNewAuthToken = () => {
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      console.log("🔵 handleLogin: getAuthToken 콜백 실행.");
      if (chrome.runtime.lastError || !token) {
        console.error(
          "🚨 handleLogin: 토큰 가져오기 실패.",
          chrome.runtime.lastError?.message
        );
        setError(
          "로그인에 실패했습니다: " +
            (chrome.runtime.lastError?.message || "Unknown error")
        );
        return;
      }
      const authToken = token as string;
      console.log("🔵 handleLogin: 토큰을 성공적으로 받았습니다.");
      await checkTokenScopes(authToken);

      try {
        console.log("🔵 handleLogin: 사용자 정보 가져오기 시도.");
        const userInfoResponse = await fetch(
          "https://www.googleapis.com/oauth2/v2/userinfo",
          {
            headers: { Authorization: `Bearer ${authToken}` },
          }
        );
        const userData: UserInfo = await userInfoResponse.json();
        console.log("🔵 handleLogin: 사용자 정보 로딩 성공.", userData);
        setUserInfo(userData);

        console.log("🔵 handleLogin: 시트 찾기/생성 프로세스 시작.");
        await findOrCreateSheet(authToken);
        console.log("🔵 handleLogin: 시트 찾기/생성 프로세스 완료.");
      } catch (err: unknown) {
        // [수정됨] any 타입 대신 unknown 사용
        console.error("🚨 handleLogin: 프로세스 중 에러 발생.", err);
        if (err instanceof Error) {
          setError("데이터 처리 중 오류가 발생했습니다: " + err.message);
        } else {
          setError("데이터 처리 중 알 수 없는 오류가 발생했습니다.");
        }
      }
    });
  };

  // [수정됨] 모든 것을 초기화하는 '하드 리셋' 로그아웃 (타입 에러 해결)
  const handleLogout = () => {
    console.log("🔴 handleLogout: 로그아웃(하드 리셋) 프로세스 시작.");
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      // 타입 가드를 사용하여 token이 string 타입인지 명확히 확인합니다.
      if (token && typeof token === "string") {
        fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
        chrome.identity.removeCachedAuthToken({ token: token }, () => {
          console.log("🔴 handleLogout: 토큰 캐시 삭제 완료.");
        });
      }
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove("spreadsheetId", () => {
          console.log("🔴 handleLogout: 저장된 시트 ID 삭제 완료.");
        });
      }
      setUserInfo(null);
      setSheetStatus("");
      setError("");
      console.log("🔴 handleLogout: 앱 상태 초기화 완료.");
    });
  };

  const handleDisconnectSheet = () => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove("spreadsheetId", () => {
        setSheetStatus(
          "시트 연결이 끊어졌습니다. 다음에 로그인하면 기존 시트를 다시 검색합니다."
        );
        console.log("🟡 handleDisconnectSheet: 시트 ID만 삭제 완료.");
      });
    }
  };

  return (
    <div className="App">
      <h1>Sheet-My-Job</h1>
      <div className="card">
        {userInfo ? (
          <div>
            <p>환영합니다, {userInfo.name} 님!</p>
            <p>({userInfo.email})</p>
            {/* [수정됨] statusMessage -> sheetStatus 오타 수정 */}
            {sheetStatus && <p className="status-message">{sheetStatus}</p>}
            <div className="button-group">
              <button onClick={handleLogout}>로그아웃 </button>
              <button onClick={handleDisconnectSheet}>시트 연결 끊기</button>
            </div>
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
