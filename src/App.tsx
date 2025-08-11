import { useState } from "react";
import "./App.css";

// 사용자 정보 객체의 타입을 정의합니다.
interface UserInfo {
  name: string;
  email: string;
}

function App() {
  // useState에 제네릭(<>)을 사용하여 상태의 타입을 명시합니다.
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string>("");

  // 로그인 버튼 클릭 시 실행될 함수
  const handleLogin = () => {
    setError(""); // 이전 에러 메시지 초기화

    // 'chrome' 객체에 대한 타입 정의가 필요할 수 있습니다.
    // 만약 에러가 발생하면, 터미널에 `npm install -D @types/chrome` 를 실행해주세요.
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      // 에러 처리: 사용자가 로그인을 거부하거나 창을 닫으면 에러가 발생합니다.
      if (chrome.runtime.lastError) {
        setError("로그인에 실패했습니다: " + chrome.runtime.lastError.message);
        return;
      }

      if (token) {
        // 성공적으로 토큰을 받으면, 사용자 정보를 가져옵니다.
        fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
          .then((response) => response.json())
          .then((data: UserInfo) => {
            // 받아온 데이터의 타입을 UserInfo로 지정합니다.
            setUserInfo(data); // 상태에 사용자 정보 저장
          })
          .catch((err) => {
            // 에러가 발생하면 콘솔에 기록하고, 사용자에게는 간단한 메시지를 보여줍니다.
            console.error("사용자 정보 로딩 API 에러:", err);
            setError("사용자 정보 로딩에 실패했습니다.");
          });
      }
    });
  };

  // 로그아웃 함수 (간단한 상태 초기화)
  const handleLogout = () => {
    setUserInfo(null);
    // TODO: 실제 토큰을 무효화하는 로직 추가 필요
  };

  return (
    <div className="App">
      <h1>Sheet-My-Job</h1>
      <div className="card">
        {userInfo ? (
          <div>
            <p>환영합니다, {userInfo.name} 님!</p>
            <p>({userInfo.email})</p>
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
