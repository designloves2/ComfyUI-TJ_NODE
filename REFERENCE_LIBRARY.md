# 레퍼런스 에셋 라이브러리 (Reference Asset Library)

MiniMax H3 레퍼런스(이미지 / 영상 / 오디오)를 **한 번 등록해 두고 ID로 계속 재사용**하는 기능입니다.
기존 방식은 큐 JSON에 파일 이름·경로만 저장해서, 파일이 사라지거나 옮겨지면 재사용이 불가능했습니다.
라이브러리는 파일을 **복사해서 자기 폴더에 보관**하므로 원본이 없어져도 ID로 계속 불러옵니다.

## 저장 위치

기본: `custom_nodes/ComfyUI-TJ_NODE_STUDIO_ONE/assetDB/` (STUDIO_ONE 폴더가 없으면 이 팩의 `assetDB/`). 폴더 안에
`.gitignore`(`*`)가 있어서 미디어·DB는 git에 올라가지 않습니다. 바꾸려면 환경변수 `TJ_REFLIB_ROOT`
또는 `POST /tj_node/reflib/settings {"root": "D:\\내폴더"}`.

```
assetDB/
  index.sqlite                  ← 에셋·프로젝트 목록 (경로는 이 폴더 기준 상대경로)
  character/<하위>/<ID>_<이름>.png
  background/ prop/ music/ voice/ video/ etc/
  _thumbs/<카테고리>/<ID>.jpg   ← 썸네일
  _cache/                       ← VAE 인코딩 캐시 (지워도 자동 재생성)
```

폴더째 다른 곳으로 옮겨도 그대로 동작합니다(상대 경로 저장). 같은 파일(sha256)은 두 번 저장하지 않습니다.

## 노드 4개 (카테고리 `✨ TJ_Node/Reference`)

0. **Reference Asset Browser (TJ)** — 카테고리 | 등록 에셋(썸네일) | 뷰어 3단 화면. 큰 미리보기(영상·오디오 재생),
   이름·카테고리·하위 폴더·태그·메모·`mp` 수정 후 **저장**, 같은 ID로 파일만 바꾸는 **교체**, 두 번 눌러 확인하는 **삭제**
   (프로젝트에서 쓰이면 그곳에서도 제거), `+ 등록`(파일 업로드), 검색(이름·태그·ID). 고른 에셋의 ID가 `asset_id` 출력.
   워크플로우 `TJ_RefLib_에셋브라우저`.
1. **Reference Asset Register (TJ)** — IMAGE / AUDIO / VIDEO를 라이브러리에 등록(연결한 입력마다 등록). 출력 `asset_ids`
   (예: `1,2`), `items`(`1=hero` 형식, Project Save에 연결). `as_set`(이미지 입력을 연결했을 때만 보임)을 켜면 이미지 배치를
   **세트**로 묶고, 그때만 `set_mode`(영상 1개 / 개별 이미지)가 나타납니다. `tags`는 쉼표로 구분한 검색용 단어입니다.
2. **Reference Project Save (TJ)** — 프로젝트 생성/갱신. **이미 등록된 에셋**을 콤보로 고르고(앞 슬롯을 고르면 다음 슬롯이 하나씩 열림, 최대 15)
   별칭을 적습니다(등록과 따로 해도 됨). 추가로 `items`(한 줄에 `id` 또는 `id=별칭`) 텍스트도 받습니다(Register의
   `items` 출력을 `prev_items`로 이어 붙여 연결 가능). 출력 `project_id`를 H3 Reference의 `project_id`에 연결하면
   그 프로젝트를 쓰고 저장이 끝난 뒤에 실행됩니다.
3. **MiniMax H3 Reference to Video (TJ)** — 올인원.
   - `mode = project`: 고른 프로젝트의 에셋을 **전부** 사용. `Load / Refresh library` 버튼을 누르면 노드 안 정보창에
     에셋 ID·별칭·종류·최종 라벨(`<Picture 1>` …)·한도·검수 결과가 표시됩니다.
   - `mode = assets`: 콤보가 하나씩 열리며(`asset_1`을 고르면 `asset_2`가 나타남, 최대 15) 라이브러리에서 골라 사용합니다(LoRA 로더처럼). `asset_count`는 자동으로 맞춰지고 API에서는 직접 지정해도 됩니다.
   - 프롬프트에 `@12`(에셋 ID) 또는 `@별칭`을 쓰면 `<Picture i>` / `<Video k>` / `<Audio j>`로 자동 치환.
     `@@`는 `@` 그대로. 직접 쓴 `<Picture 1>`도 그대로 유지(범위 검사만 함).
   - `match_check`: `strict` 오류면 중단 / `warn` 보고하고 실행 / `off` 막지 않음(파일 누락·변조는 항상 중단).
   - 출력: `positive`, `latent`, `snapshot`(어떤 에셋이 어떤 라벨로 들어갔는지 JSON), `report`(검수 결과 JSON).
   - `overrides`: 이번 클립만 에셋 설정 변경, 예 `{"items":{"12":{"mp":1.0,"start":0,"end":5}}}`.
   - `encode_cache`: 같은 레퍼런스의 VAE 인코딩을 캐시해 재사용(테스트: 25.9초 → 12.1초).

한도(코어 기준): 이미지 9 / 영상 3 / 영상 소리 3 / 단독 오디오 3. 초과하면 `LIMIT_EXCEEDED`.

## 콤보 값 형식 (폴더처럼 보이기)

에셋 콤보 값은 `카테고리/하위카테고리/이름 [id:번호]` 입니다. 예: `character/demo/Hero [id:1]`, `background/Room [id:2]`.
`/`가 들어 있어서 rgthree 등 자동 중첩 메뉴에서는 폴더처럼 접혀 보이고(기본 ComfyUI 메뉴는 한 줄 목록),
카테고리 순으로 정렬됩니다. 프로젝트 콤보는 `이름 [id:번호]`. 값에서는 `[id:번호]`(없으면 맨 앞 숫자, 예: `12`)만 읽으므로
API에서 `"12"`만 넣어도 되고, 예전 형식(`1: Hero [character]`)도 계속 읽힙니다.

## MiniMax H3 Image to Video (TJ)

코어 `MiniMax H3 Image to Video`(텍스트 / 첫 프레임 / 마지막 프레임 → 영상)를 감싼 노드. 첫·마지막 프레임을 **이미지 연결**로
주거나 라이브러리의 **이미지 에셋 콤보**(`first_asset`, `last_asset`)로 고를 수 있습니다(이미지가 연결돼 있으면 연결이 우선).
선택한 에셋의 썸네일이 노드에 표시되고, `encode_cache`와 무선 Set/Get 위젯이 있습니다. 출력 `positive`, `latent`.

## 에셋별 설정 (등록 시 기본값, `overrides`로 클립별 변경)

`mp`(메가픽셀 상한, 줄이기만 함) · `start`/`end`(초) · `with_audio`(영상 소리 포함) ·
`set_mode`(`video` = 세트를 영상 1개로 / `images` = 개별 이미지) · `frames_per_image`(기본 12) · `fit`(`pad`|`crop`).

## 세트(앨범)

같은 인물·장소의 여러 각도 사진 묶음. `video` 모드는 장당 12프레임으로 이어 붙여 `<Video k>` 1개로 전달
(코어가 영상을 12프레임마다 샘플링 → 이미지마다 1장씩 보임). 길이 규칙(`n%17==5`)에 맞춰 뒤쪽을 마지막 이미지로
채워서 이미지가 잘려 나가지 않게 합니다.

## 예제 워크플로우 (왼쪽 Workflows 패널의 `TJ_RefLib_에셋라이브러리_최종`)

워크플로우 하나에 그룹 5개 + 모델 그룹이 들어 있습니다. 처음 Queue를 누르면 ① ② ③이 실행되고, ④ ⑤는 Mute 상태입니다
(그룹을 Ctrl+드래그로 선택 → Ctrl+M 으로 켬).

| 그룹 | 내용 |
|---|---|
| ⓪ 에셋 브라우저 | 카테고리 / 등록 에셋 / 뷰어 3단 화면 — 미리보기, 이름·카테고리 수정, 교체, 삭제 |
| ① 등록 | 이미지 2장·이미지 세트·오디오·영상을 Register 5개로 등록 |
| ② 프로젝트 만들기 | 이미 등록된 에셋을 콤보로 골라 프로젝트로 저장 (①과 독립) |
| ③ Reference to Video - 프로젝트 모드 | 프로젝트 전체로 8스텝 생성 (Singularity v1.3 + dmd ref2va 8step + Sage + MemEff) |
| ④ Reference to Video - 에셋 모드 | 콤보로 고른 에셋 4개로 생성 (Mute) |
| ⑤ Image to Video | 첫/마지막 프레임을 에셋 콤보로 지정, fl2va + 8step LoRA (Mute) |
| 모델 (공용) | CLIP / VAE / 모델 / LoRA / Sage |

결과 영상은 `C:\AI\output\TJ_RefLib\`에 mp4로 저장됩니다.

## REST (`/tj_node/reflib/…`, 로컬 전용 가드)

`GET info` · `POST settings` · `GET assets` · `GET assets/{id}` · `POST assets`(업로드) · `POST assets/import`
(input/output/temp 안의 파일) · `POST sets` · `POST assets/{id}/update`(이름·카테고리 이동·설정) ·
`POST assets/{id}/delete` · `GET thumb|file|preview/{id}` · `GET/POST projects` · `GET projects/{id}` ·
`POST projects/{id}/delete` · **`POST resolve`** · `GET bundle/export` · `POST bundle/import` · `POST cache/clear` · `GET check`.

가드: 루프백 + 동일 출처만 허용. 다른 웹 출처(웹 트윈 등)를 허용하려면
`<ComfyUI user 폴더>/tj_reflib.json`의 `"allowed_origins": ["https://..."]`에 추가(기본은 비어 있음).

## 알려진 제한

- 영상 소리는 영상 파일 안의 오디오 트랙을 사용합니다.
- Qwen3-VL 쪽 처리는 프롬프트와 함께 이뤄져서 캐시할 수 없습니다(VAE 인코딩만 캐시).
- 라이브러리 가드는 Cloudflare 터널을 통한 접속도 "로컬"로 인식합니다(cloudflared가 로컬에서 접속하기 때문).
