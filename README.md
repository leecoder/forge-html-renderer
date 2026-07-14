# forge-html-renderer

Confluence Cloud용 Forge 매크로 — HTML 첨부파일을 페이지 내에서 인라인 렌더링합니다.

## 기능

- HTML 첨부파일을 sandboxed iframe으로 인라인 렌더링
- JavaScript/CSS 포함 인터랙티브 콘텐츠 지원
- 첨부파일 선택 UI (매크로 설정 패널)
- 높이 자동 조절 (콘텐츠 기반) + 드래그로 수동 조절
- Sandbox 권한 세분화 설정 (scripts, forms, popups 등)

## 프로젝트 구조

```
forge-html-renderer/
├── manifest.yml              # Forge 앱 설정
├── package.json              # Backend dependencies
├── src/
│   └── index.js              # Forge resolver (API handler)
└── static/
    ├── package.json          # Frontend dependencies
    ├── vite.config.js        # Vite 빌드 설정
    ├── index.html            # Entry HTML
    └── src/
        ├── index.jsx         # React entry point
        ├── App.jsx           # Main render component
        └── Config.jsx        # Macro config panel
```

## 설치 & 배포

### 사전 요건

- Node.js 18+
- Forge CLI: `npm install -g @forge/cli`
- Atlassian 계정 (developer.atlassian.com)

### 1. Forge CLI 로그인

```bash
forge login
# API token 입력 (https://id.atlassian.com/manage-profile/security/api-tokens)
```

### 2. App ID 등록

```bash
forge register
# manifest.yml의 app.id가 자동 업데이트됨
```

### 3. 의존성 설치

```bash
# Backend
npm install

# Frontend (Custom UI)
cd static
npm install
npm run build
cd ..
```

### 4. 배포

```bash
forge deploy
```

### 5. 사이트에 설치

```bash
forge install --site your-company.atlassian.net --product confluence
```

## 사용법

1. Confluence 페이지에 HTML 파일을 첨부파일로 업로드
2. 페이지 편집 모드에서 `/HTML Attachment Renderer` 매크로 삽입
3. 매크로 설정에서:
   - 렌더링할 HTML 첨부파일 선택
   - 높이 설정 (0 = 자동)
   - 필요한 Sandbox 권한 체크
4. 저장하면 HTML이 인라인 렌더링됨

## 보안 고려사항

- 모든 HTML은 `sandbox` 속성이 적용된 iframe 내에서 실행됩니다
- 기본값은 `allow-scripts`만 활성화 (최소 권한)
- `allow-same-origin`은 필요한 경우에만 활성화하세요 (쿠키/localStorage 접근 허용)
- Forge 앱은 Atlassian 인프라에서 실행되므로 외부 서버 불필요

## 개발 (로컬 터널)

```bash
# Backend tunneling
forge tunnel

# Frontend dev server (별도 터미널)
cd static
npm start
```

## 라이선스

MIT
