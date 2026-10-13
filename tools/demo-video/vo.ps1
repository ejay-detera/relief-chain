# Generates one voice-over WAV per scene using the offline Windows speech engine.
# Usage: powershell -File vo.ps1 -Json scenes.json -Out build\vo -Rate 0
param(
  [Parameter(Mandatory = $true)][string]$Json,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Rate = 0,
  [string]$Voice = 'Microsoft Zira Desktop'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $synth.SelectVoice($Voice) } catch { Write-Warning "Voice '$Voice' not found, using default." }
$synth.Rate = $Rate
$scenes = Get-Content -Raw -Path $Json | ConvertFrom-Json
foreach ($s in $scenes) {
  if (-not $s.vo) { continue }
  $text = if ($s.say) { $s.say } else { $s.vo }
  $file = Join-Path $Out ($s.id + '.wav')
  $synth.SetOutputToWaveFile($file)
  $synth.Speak($text)
}
$synth.SetOutputToNull()
$synth.Dispose()
