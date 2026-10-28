param([string]$HermesSource='',[string]$Python='3.14',[string]$Revision='ee7e0f517232fb619c72e49d7e648436bddc598e')
$ErrorActionPreference='Stop'
$workspace=Split-Path -Parent $PSScriptRoot
if(-not (Get-Command uv -ErrorAction SilentlyContinue)){throw '请先安装 uv：https://docs.astral.sh/uv/getting-started/installation/'}
if(-not $HermesSource){
 $HermesSource=Join-Path $workspace 'data/hermes-agent'
 if(-not (Test-Path -LiteralPath $HermesSource)){
  if(-not (Get-Command git -ErrorAction SilentlyContinue)){throw '请先安装 Git'}
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $HermesSource) | Out-Null
  & git clone --filter=blob:none --no-checkout https://github.com/NousResearch/hermes-agent.git $HermesSource
  if($LASTEXITCODE -ne 0){throw '下载 Hermes 失败，请检查网络后重试'}
  & git -C $HermesSource checkout --detach $Revision
  if($LASTEXITCODE -ne 0){throw '无法检出指定的 Hermes 版本'}
 }
}
if(-not (Test-Path -LiteralPath (Join-Path $HermesSource 'run_agent.py'))){throw '请指定有效的 Hermes 源码目录；安装失败留下的空目录需先检查后移除再重试'}
$runtime=Join-Path $workspace 'data/hermes-runtime'
if(-not (Test-Path -LiteralPath (Join-Path $runtime 'Scripts/python.exe'))){
 & uv venv --python $Python $runtime
 if($LASTEXITCODE -ne 0){throw '创建 Hermes 项目运行时失败'}
}
& uv pip install --python (Join-Path $runtime 'Scripts/python.exe') -r (Join-Path $workspace 'agents/requirements-hermes.txt')
if($LASTEXITCODE -ne 0){throw '安装 Hermes 运行依赖失败'}
Write-Output 'Hermes 项目运行时已准备。应用使用独立技能目录与任务会话，不修改全局 Hermes 配置。'
Write-Output ('源码：'+$HermesSource)
Write-Output '若使用自定义源码目录，请在 .env 中设置 HERMES_SOURCE_PATH；默认路径无需额外配置。'
