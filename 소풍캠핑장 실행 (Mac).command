#!/bin/zsh
set -eu

camp_project_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
camp_runtime="$camp_project_dir/node_modules/electron/dist/Electron.app"

if [[ ! -d "$camp_runtime" || ! -f "$camp_project_dir/dist/index.html" ]]; then
  print '실행에 필요한 파일이 없어요. 이 실행 파일은 camping site 폴더 안에 두고 사용해 주세요.'
  print '개발 환경을 다시 설치했다면 프로젝트 폴더에서 npm ci와 npm run build를 실행해 주세요.'
  read -r '?엔터를 누르면 종료합니다. '
  exit 1
fi

unset ELECTRON_RUN_AS_NODE SOPUNG_TEST_DIR
open -n "$camp_runtime" --args "$camp_project_dir"
