# ComfyUI TJ_NODE (v0.1)

ComfyUI에서 대량의 멀티 채널 KSampler 워크플로우를 사용할 때 발생하는 이미지 배치 및 파일명 유실 문제를 해결하기 위해 설계된 커스텀 노드 세트입니다.  
특히 **ComfyUI_Eclipse** 노드의 고급 파일 저장 기능과 완벽하게 연동되며, 중간 노드가 바이패스(Bypass)되어도 에러 없이 유연하게 작동합니다.

## 주요 기능 (Key Features)

- **Bypass Safe (자동 에러 방지)**: 이미지 생성 파이프라인 중간에 특정 노드가 바이패스(`None` 값 전달)되어도 워크플로우가 멈추지 않고, 살아있는 데이터만 순서대로 취합합니다. 모든 노드가 바이패스되면 안전하게 블랙 스크린을 출력합니다.
- **Dynamic Inputs (가변 인풋 증설)**: 노드에 선을 연결할 때마다 다음 인풋 핀(`image_2`, `files_2`...)이 프론트엔드(UI)에서 자동으로 생성되며, 끊어지면 자동으로 정리됩니다.
- **파일명 자동 추적 (Eclipse 연동)**: 이클립스 저장 노드가 지어준 복잡한 정규식 기반 파일명(`%date%_%seed%` 등)을 메모리 상에서 역추적하여, 업스케일 이후 최종 저장 시 원본 파일명 뒤에 사용자가 지정한 접미사(Suffix)를 안전하게 붙여줍니다.

---

## 노드 라인업 (Node Lineup)

### 1. Standard Type (기본형 파이프라인)
- **Dynamic Image Batch(TJ)**: 표준 가변 배치 노드 (해상도 자동 리사이즈 포함)
- **Save Image(Primary-TJ)**: 단일 채널용 선행 저장 노드 (파일명 문자열 출력)
- **Save Image(Suffix-TJ)**: 단일 채널용 후속 저장 노드 (이름 상속 후 접미사 추가)

### 2. Eclipse Type (이클립스 대용량 멀티 채널용)
- **Dynamic Image Batch(Eclipse-TJ)**: 이클립스 `IMAGE`와 `files` 목록을 세트로 받아 바이패스를 거르고 파일명을 동기화하는 핵심 배치 노드.
- **Save Image(Eclipse Suffix-TJ)**: 업스케일러 뒷단에서 이클립스 원본 파일명을 역추적해 접미사를 붙여 최종 저장하는 노드.

---

## 설치 방법 (Installation)

### 방법 1: 수동 설치 (Manual)
1. ComfyUI 설치 폴더 내의 `custom_nodes` 디렉토리로 이동합니다.
2. `comfyui-dynamic-batch` 폴더를 생성합니다.
3. 본 저장소의 파일들을 아래와 같은 구조로 배치합니다:
   ```text
   custom_nodes/comfyui-dynamic-batch/
   ├── __init__.py
   ├── dynamic_image_batch.py
   └── web/
       └── dynamic_batch.js
