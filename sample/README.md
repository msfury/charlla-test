# 샘플 영상

업로드 테스트에 쓰는 영상들이다. 화면 업로드(JSP `/upload`, React `/charlla-test`)와
통합 테스트(`CharllaUploadIT`)가 같은 파일을 쓴다.

| 파일 | 해상도 | 길이 | 용도 |
|---|---|---|---|
| `sample-10s.mp4` | 1920x1080 (가로) | 10초 | 정상 업로드 확인 |
| `sample-10s-vertical.mp4` | 1080x1920 (세로) | 10초 | shoplayer 규격. 세로 숏폼 |
| `sample-70s.mp4` | 1080x1920 (세로) | 70초 | 콜백 `EXCESS_DURATION` 확인용 |

전부 Blender Foundation 의 **Big Buck Bunny** (CC BY 3.0) 에서 만들었다.
세로본은 가로본을 90도 회전한 것이고, 70초본은 세로본을 7번 이어붙인 것이다.

찰나는 **60초를 초과하는 영상을 거부**하고, 그 사실을 업로드 응답이 아니라
**콜백의 `status=EXCESS_DURATION`** 으로 알려준다. `sample-70s.mp4` 는 그 경로를 확인하기 위한 것이다.

`CharllaUploadIT` 는 파일이 없으면 `Assumptions` 로 건너뛴다. "통과"로 착각하지 말 것.
