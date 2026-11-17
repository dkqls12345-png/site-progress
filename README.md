# 아빈 인테리어 현장 진행

공사 현장마다 JSON 파일 하나를 두고, 고객은 자기 현장 링크로 진행률과 공정 체크리스트를 봅니다. 서버 없이 정적 파일만 사용하고, GitHub Pages로 배포합니다.

## 주소

- 사이트: https://dkqls12345-png.github.io/site-progress/
- 샘플 고객 링크: https://dkqls12345-png.github.io/site-progress/site.html?id=k7m2q9xp4nwb
- 관리 페이지: https://dkqls12345-png.github.io/site-progress/admin.html

샘플 현장은 `sample: true`이고 화면에 샘플 배너가 나옵니다. 실제 고객 현장이 아닙니다. 기준일은 2026년 11월 17일입니다.

## 고객에게 링크 보내는 방법

1. 관리 페이지나 JSON 파일로 현장을 만듭니다. 현장 ID는 12자 무작위 코드입니다.
2. 아래 형태의 주소를 카카오톡으로 보냅니다.

   `https://dkqls12345-png.github.io/site-progress/site.html?id=현장ID`

3. 고객은 그 링크로 진행률, 공정 막대, 체크 상태를 봅니다. 화면은 약 60초마다 데이터를 다시 받습니다.
4. 첫 화면에는 현장 목록이 없습니다. 샘플 현장 링크만 예시로 연결되어 있습니다.

## 관리 페이지와 토큰

관리 페이지에서 현장을 만들고, 공정 상태·날짜·체크리스트를 고치면 GitHub Contents API로 `main` 브랜치의 JSON 파일을 커밋합니다.

### 토큰 만들기

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Repository access에서 `site-progress`만 선택합니다.
3. Permissions에서 **Contents: Read and write**를 줍니다.
4. 생성된 `github_pat_...` 토큰을 복사합니다.

### 쓰는 방법

1. `admin.html`을 엽니다.
2. 토큰을 붙여 넣고 저장합니다.
3. 토큰은 이 브라우저의 `localStorage`에만 남습니다. 현장 JSON이나 이 저장소 파일에는 들어가지 않습니다. 브라우저가 토큰을 보내는 곳은 `api.github.com`뿐입니다.
4. **템플릿으로 새 현장**을 누르면 `data/template.json`의 공정과 체크리스트로 현장을 만들고, 착공일·준공 예정일에 맞춰 예정일을 채운 뒤 `data/sites/<id>.json`으로 커밋합니다.
5. 공정은 대기 / 진행중 / 완료로 바꿉니다. 진행중으로 바꾸면 실제 시작일이, 완료로 바꾸면 실제 종료일이 비어 있을 때 오늘 날짜로 채워집니다. 체크를 켜면 확인일이 오늘로 들어갑니다.
6. **main에 저장**을 누르면 고객 링크에 반영될 JSON이 커밋됩니다.
7. 공용 컴퓨터를 쓴 뒤에는 **토큰 지우기**를 누릅니다. 토큰이 새어 나갔다면 GitHub에서 그 토큰을 폐기합니다.

## 손으로 JSON 고치기

1. `data/template.json`을 복사해 `data/sites/<어려운-id>.json`으로 저장합니다.
2. `id`를 파일명과 같게 맞추고, 이름·지역·날짜·상태를 채웁니다.
3. 템플릿의 `startOffset`, `durationDays`, `note`는 일정 계산용입니다. 현장 파일에는 넣지 않고 `plannedStart`, `plannedEnd`를 직접 적습니다.
4. `main`에 커밋합니다.

현장 파일 예:

```json
{
  "id": "k7m2q9xp4nwb",
  "sample": false,
  "name": "잠실 32평 아파트 리모델링",
  "customerName": "",
  "area": "서울 송파구",
  "startDate": "2026-10-20",
  "expectedEndDate": "2026-12-12",
  "manager": { "name": "아빈", "contact": "카카오톡 채널 안내" },
  "updatedAt": "2026-11-17T08:40:00+09:00",
  "processes": []
}
```

공정(`processes`)은 순서대로 보여 줍니다. 각 공정 필드는 다음과 같습니다.

| 필드 | 내용 |
| --- | --- |
| `status` | `대기`, `진행중`, `완료` |
| `plannedStart`, `plannedEnd` | 예정 시작·종료 (`YYYY-MM-DD`) |
| `actualStart`, `actualEnd` | 실제 시작·종료. 없으면 `""` |
| `notes` | 고객에게 보이는 메모 |
| `photos` | 사진 주소 배열. `https://...` 또는 `assets/파일명` |
| `checklist` | `id`, `label`, `checked`, `checkedAt`, `memo` |

진행률은 공정을 같은 비중으로 둡니다. 완료는 100%, 대기는 0%, 진행중은 그 공정 체크리스트의 완료 비율입니다. 체크리스트가 없는 진행중 공정은 50%로 봅니다.

## 기본 체크리스트

| 공정 | 확인 항목 |
| --- | --- |
| 철거 | 철거 범위 고객 확인, 엘리베이터·공용부 보양, 수도·전기 차단, 건설 폐기물 반출, 철거 후 구조체 상태 확인 |
| 설비/배관 | 급수·온수 배관 위치, 오배수 구배, 배관 누수 테스트, 난방 배관 압력 테스트, 밸브 위치 고객 안내 |
| 전기 | 콘센트·스위치 위치 확정, 분전반·차단기 용량, 접지 시공, 조명 스위치 회로, 통신·TV 배선 |
| 목공 | 문틀 수평·수직, 천장 수평, 단열·석고 마감, 가구 하지 수평, 몰딩·걸레받이 이음 |
| 타일 | 방수 (도막·양생), 바닥 구배, 줄눈, 들뜸·파손, 코너 실리콘 |
| 도장 | 퍼티·샌딩, 프라이머·도장 횟수, 색상 고객 확인, 오염·붓자국, 건조 상태 |
| 도배 | 바탕면 정리, 이음매, 모서리·코너, 스위치 박스 마감, 접착·들뜸 |
| 바닥 | 바탕 평활, 들뜸·삐걱임, 문턱·단차, 표면 스크래치, 이음 간격 |
| 가구/주방 | 상·하부장 수평, 싱크볼 배수, 상판 실리콘, 도어 개폐·단차, 레일·경첩 |
| 조명/마감 | 등기구 점등, 스위치 연동, 실리콘·코킹 마감, 악세서리 설치, 하자 리스트 작성 |
| 입주청소 | 목공·석고 분진 제거, 창호·유리, 주방·욕실, 바닥 마감 청소, 인수인계 점검 |

항목은 관리 페이지에서 추가하거나 지울 수 있고, JSON에서 직접 고쳐도 됩니다.

## 배포

`.github/workflows/pages.yml`이 `main`에 푸시될 때마다 GitHub Actions로 Pages에 배포합니다.

Pages를 처음 연결할 때는 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다. 이 저장소에 관리 권한이 있으면 API로도 같은 설정을 켤 수 있습니다.

```bash
gh api --method POST repos/dkqls12345-png/site-progress/pages --input - <<< '{"build_type":"workflow"}'
```

워크플로 파일이 `main`에 있어야 배포가 실행됩니다.

## 로컬에서 보기

```bash
python3 -m http.server 8765
```

브라우저에서 http://localhost:8765/site.html?id=k7m2q9xp4nwb 를 엽니다. 파일을 더블클릭으로 열면 JSON을 읽지 못합니다.

확인 테스트:

```bash
node tests/logic.test.js
```

## 한계와 주의

- 이 저장소는 공개입니다. 고객의 상세 주소, 전화번호, 계약 금액은 JSON에 넣지 않습니다. 지역은 `서울 송파구`처럼 짧게만 적습니다.
- 현장 ID가 열람 수단입니다. 짧은 단어나 집 호수로 만들지 않습니다. 관리 페이지는 혼동하기 쉬운 문자를 뺀 12자를 만듭니다.
- 첫 화면에 목록을 올리지 않습니다. 저장소가 공개이므로 GitHub 코드 화면이나 Contents API로 파일명을 볼 수 있는 사람은 ID를 알 수 있습니다. 민감 정보를 넣지 않는 것으로 보완합니다.
- 고객 화면에는 로그인이 없습니다. 링크를 받은 사람은 그 현장을 볼 수 있습니다.
- 고객 화면은 약 60초마다 JSON을 다시 요청합니다.
- 저장 직후 고객 화면에 바로 보이지 않을 수 있습니다. `main` 커밋 뒤 GitHub Actions가 Pages를 다시 배포하고, Pages 캐시가 보통 1분 안팎으로 이전 파일을 보여줄 수 있습니다. 전체로는 1분에서 몇 분 걸리는 경우가 있습니다.
- 토큰은 그 브라우저에 남으며 저장소 내용을 수정할 수 있습니다. 공용 PC에 저장해 두지 않습니다.
