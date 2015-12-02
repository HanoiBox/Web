param (
	[string]$buildFolder = "build"
)

function Get-ScriptDirectory
{
  $Invocation = (Get-Variable MyInvocation -Scope 1).Value
  Split-Path $Invocation.MyCommand.Path
}

function Clean-Directory($scriptPath) {
	$buildPath = ("{0}\{1}" -f $scriptPath, $buildFolder)
	Remove-Item $buildPath -Force -Recurse
}

function Create-Directory($scriptPath) {
	$newDir = ("{0}\{1}" -f $scriptPath, $buildFolder)
	New-Item $newDir -type directory
}

$scriptPath = Get-ScriptDirectory
#Clean-Directory $scriptPath
Create-Directory $scriptPath

## Must run: npm install --global babel-cli
#cd..
#babel -d .app/build ./app