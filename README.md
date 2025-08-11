# Sheet-My-Job: 구직 활동 트래커

원티드, 사람인 등 여러 채용 플랫폼에서의 지원 기록을 구글 시트에 자동으로 저장하여 구직 활동을 체계적으로 관리해주는 크롬 확장프로그램입니다.

---

## 🚀 주요 기능

- **구글 계정 연동:** 한 번의 로그인으로 모든 설정 완료
- **구글 시트 자동 생성:** 첫 로그인 시, 지원 기록을 저장할 전용 구글 시트 자동 생성
- **(예정) 지원 정보 자동 저장:** 채용 사이트에서 지원 시, 플랫폼, 회사명, 지원일, 공고 링크 자동 기록

---

## 🛠️ 기술 스택 (Tech Stack)

- **프레임워크/빌드도구:** React, Vite
- **언어:** TypeScript
- **주요 API:**
  - Chrome Extension APIs (`identity`, `storage`)
  - Google APIs (`Google Sheets API`, `Google People API`)

---

## 📈 현재까지의 진행 상황 (Milestone)

**[✅ 완료] 1. 프로젝트 환경 구축**

- Vite를 사용하여 React + TypeScript 프로젝트 생성
- 크롬 확장프로그램으로 동작하도록 `vite.config.js` 및 `manifest.json` 설정 완료

**[✅ 완료] 2. 구글 인증 및 API 연동**

- Google Cloud Platform에서 프로젝트 생성 및 API(Sheets, People) 활성화
- OAuth 2.0 클라이언트 ID 발급 완료
- `chrome.identity` API를 사용하여 구글 계정 로그인 및 사용자 정보(이름, 이메일) 확인 기능 구현

**[✅ 완료] 3. 구글 시트 자동 생성**

- 사용자가 처음 로그인할 때, Google Sheets API를 호출하여 전용 스프레드시트(`Sheet-My-Job 지원 기록`)를 자동으로 생성하는 기능 구현
- 생성된 시트의 첫 행에 헤더(`플랫폼`, `회사명` 등)를 자동으로 추가하는 기능 구현
- 생성된 시트의 ID를 `chrome.storage`에 저장하여 중복 생성을 방지하는 로직 구현

---

## 📂 주요 파일 및 역할

- **`public/manifest.json`**: 확장프로그램의 설계도. 이름, 버전, 권한, 스크립트 파일 등을 정의합니다.
- **`vite.config.js`**: Vite 빌드 설정 파일. React 앱과 백그라운드 스크립트 등을 함께 빌드하도록 설정했습니다.
- **`src/App.tsx`**: 확장프로그램 아이콘 클릭 시 나타나는 팝업 UI 컴포넌트. 로그인/로그아웃 및 시트 생성 상태를 관리합니다.

---

## 🎯 다음 목표 (Next Steps)

1.  **`content.js` 구현:**

    - 채용 사이트(예: 원티드)의 웹 페이지에 직접 삽입되어, '지원하기'와 같은 특정 행동을 감지하는 역할을 합니다.
    - 페이지의 HTML 구조를 분석하여 회사명, 공고 제목 등의 정보를 추출(Scraping)합니다.

2.  **`background.js` 구현:**

    - `content.js`와 `App.tsx` 사이의 중재자 역할을 합니다.
    - `content.js`로부터 전달받은 지원 정보를 Google Sheets API를 통해 실제 시트에 기록하는 로직을 수행합니다.

3.  **데이터 저장 로직 완성:**
    - `background.js`가 추출된 정보를 받아, 이전에 생성된 구글 시트의 마지막 행에 새로운 지원 기록을 한 줄씩 추가합니다.
