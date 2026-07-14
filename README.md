# forge-html-renderer

Confluence Cloud용 Forge 매크로 — HTML 첨부파일을 페이지 내에서 인라인 렌더링합니다.

## 기능

- HTML 첨부파일을 sandboxed iframe으로 인라인 렌더링
- **inline JavaScript/CSS 실행** (Chart.js, D3.js 등 외부 라이브러리 포함)
- 매크로에서 직접 HTML 파일 업로드
- 파일 선택 자동 저장 (매크로 인스턴스별 독립)
- 높이 자동 조절 (콘텐츠 기반, 기본 400px) + 수동 입력 가능
- 여러 HTML 파일이 있을 경우 드롭다운 선택

## 사용법

### 매크로 삽입

1. Confluence 페이지 편집 모드에서 `/HTML Attachment Renderer` 입력
2. 매크로가 삽입되면 toolbar에서:
   - **Upload HTML** — 로컬 .html 파일을 업로드 (페이지 첨부파일로 저장됨)
   - **파일 선택** — 이미 첨부된 HTML 파일 중 선택 (2개 이상일 때)
   - **H: [px]** — 높이 수동 지정 (비워두면 자동)
3. 페이지 업데이트(저장) → 보기 모드에서 인라인 렌더링

### 높이 동작

| 상태 | 동작 |
|------|------|
| 높이 미입력 + 콘텐츠 < 400px | 콘텐츠에 맞춰 자동 조절 |
| 높이 미입력 + 콘텐츠 > 400px | 400px + 스크롤 |
| 높이 직접 입력 (예: 800) | 입력값 적용, max 제한 없음 |

높이 값은 매크로별로 저장되어 보기 모드에서도 유지됩니다.

### 지원되는 HTML 콘텐츠

- 순수 HTML/CSS 레이아웃
- inline `<script>`, `<style>` 태그
- `onclick` 등 이벤트 핸들러
- 외부 CDN 라이브러리 (아래 "허용된 CDN" 참조)

## 허용된 CDN 도메인

HTML에서 `<script src="https://...">` 로 참조하는 외부 라이브러리는 manifest에 등록된 도메인만 허용됩니다.

현재 등록된 도메인:

| 도메인 | 용도 |
|--------|------|
| `cdn.jsdelivr.net` | Chart.js, 각종 npm 패키지 |
| `cdnjs.cloudflare.com` | 범용 CDN |
| `unpkg.com` | npm 패키지 |
| `d3js.org` | D3.js |
| `cdn.plot.ly` | Plotly |
| `cdn.datatables.net` | DataTables |
| `code.highcharts.com` | Highcharts |
| `www.gstatic.com` | Google Charts |
| `ajax.googleapis.com` | jQuery, Google 라이브러리 |
| `code.jquery.com` | jQuery |
| `cdn.tailwindcss.com` | Tailwind CSS |
| `cdn.bokeh.org` | Bokeh |
| `fonts.googleapis.com` | Google Fonts |

### 새 CDN 도메인 추가 방법

1. `manifest.yml`의 `permissions.external.scripts` (또는 `styles`)에 도메인 추가
2. GitHub에서 릴리즈 생성 → 자동 배포
3. 배포 후 `forge install --upgrade` 필요 (새 도메인 승인)

```yaml
# manifest.yml 예시
permissions:
  external:
    scripts:
      - "https://new-cdn.example.com"   # 추가
```

## 프로젝트 구조

```
forge-html-renderer/
├── manifest.yml              # Forge 앱 설정 (scopes, CSP, CDN 도메인)
├── package.json              # Backend dependencies
├── src/
│   └── index.js              # Forge resolver (API handlers)
└── static/
    ├── package.json          # Frontend dependencies (React, Vite)
    ├── vite.config.js        # Vite 빌드 설정
    ├── index.html            # Entry HTML
    └── src/
        ├── index.jsx         # React entry point
        └── App.jsx           # Main component (render + upload + height)
```

## 배포

### 자동 배포 (GitHub Actions)

GitHub에서 Release를 생성하면 자동으로 배포됩니다:

1. GitHub → Releases → "Create a new release"
2. Tag: `vX.Y.Z` (예: `v7.3.0`)
3. Publish → GitHub Actions가 자동으로:
   - npm install + build
   - `forge deploy --environment production`

> **주의**: 새 CDN 도메인을 추가한 경우, 배포 후 수동으로 `forge install --upgrade` 실행 필요.

### 수동 배포

```bash
npm install
cd static && npm install && npm run build && cd ..
forge deploy --environment production
forge install --upgrade --site tmobi.atlassian.net --product confluence --environment production
```

## 초기 설정 (최초 1회)

```bash
# Forge CLI 설치
npm install -g @forge/cli

# 로그인
forge settings set usage-analytics false
forge login --email YOUR_EMAIL --token YOUR_API_TOKEN --non-interactive

# SSL 프록시 환경 (사내망)
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

## 알려진 제한사항

| 제한 | 원인 | 대안 |
|------|------|------|
| 새 창에서 열기 불가 | Forge sandbox `allow-popups` 미설정 + Confluence hostile attachment 정책 | 높이를 크게 설정하여 인라인에서 확인 |
| 외부 CDN 와일드카드 불가 | Forge manifest에서 `https://*` 미지원 | 사용하는 CDN을 manifest에 명시적 등록 |
| 편집/보기 모드 구분 불가 | Forge iframe cross-origin으로 parent 감지 불가 | Toolbar 항상 표시 |

## 보안

- 모든 HTML은 `sandbox="allow-scripts allow-same-origin allow-popups"` iframe 내 실행
- CSP: `unsafe-inline` + `unsafe-eval` 허용 (HTML 내 인터랙티브 콘텐츠용)
- 데이터 접근: `api.asUser()` — 로그인한 사용자 권한으로만 동작
- Forge KVS: 매크로 설정(파일 선택, 높이)만 저장, 콘텐츠 미저장
- 앱은 Atlassian 인프라에서 실행, 별도 서버 없음

## 라이선스

MIT
