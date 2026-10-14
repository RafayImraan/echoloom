param(
  [string]$BroadcastFile = "broadcast\Deploy.s.sol\10143\run-latest.json",
  [string]$OutputFile = "..\web\deployment.json"
)
$ErrorActionPreference = 'Stop'
$resolvedBroadcast = (Resolve-Path -LiteralPath $BroadcastFile).Path
$run = Get-Content -Raw -LiteralPath $resolvedBroadcast | ConvertFrom-Json
if ([string]$run.chain -ne '10143') { throw "Expected Monad Testnet chain 10143; found $($run.chain)." }
$deployment = @($run.transactions | Where-Object { $_.transactionType -eq 'CREATE' -and $_.contractName -eq 'EchoLoomHub' } | Select-Object -Last 1)
if ($deployment.Count -ne 1 -or $deployment[0].contractAddress -notmatch '^0x[0-9a-fA-F]{40}$' -or $deployment[0].hash -notmatch '^0x[0-9a-fA-F]{64}$') { throw 'No valid EchoLoomHub deployment address and transaction hash found in Foundry broadcast output.' }
$receipt = @($run.receipts | Where-Object { $_.transactionHash -eq $deployment[0].hash -and [string]$_.status -in @('1','0x1') } | Select-Object -First 1)
if ($receipt.Count -ne 1 -or -not $receipt[0].blockNumber -or -not $receipt[0].contractAddress) { throw 'The deployment transaction has no complete successful receipt; refusing to write frontend configuration.' }
if ($receipt[0].contractAddress.ToLowerInvariant() -ne $deployment[0].contractAddress.ToLowerInvariant()) { throw 'Deployment transaction address does not match its receipt.' }
$block = [string]$receipt[0].blockNumber
if ($block -match '^0x[0-9a-fA-F]+$') { $block = [Convert]::ToInt64($block.Substring(2), 16).ToString() }
if ($block -notmatch '^\d+$') { throw 'Deployment receipt block number is invalid.' }
$artifact = [ordered]@{ chainId = 10143; address = $deployment[0].contractAddress; transactionHash = $deployment[0].hash; deploymentBlock = [string]$block; explorerTransaction = "https://testnet.monadscan.com/tx/$($deployment[0].hash)" }
$target = Join-Path (Get-Location) $OutputFile
$artifact | ConvertTo-Json | Set-Content -LiteralPath $target -Encoding utf8
Write-Host "Wrote verified deployment metadata to $target"
