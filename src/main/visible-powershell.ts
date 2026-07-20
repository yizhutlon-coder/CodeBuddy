import { spawnSync } from "node:child_process";

const powerShellLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

export const launchVisiblePowerShell = (
  scriptPath: string,
  workingDirectory: string,
  scriptArguments: string[] = [],
  extraEnv: Record<string, string> = {},
  keepOpen = true,
): number => {
  const argumentValues = [
    ...(keepOpen ? ["-NoExit"] : []),
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    ...scriptArguments,
  ];
  const encodedCommand = Buffer.from(
    [
      `$argumentValues = @(${argumentValues.map(powerShellLiteral).join(", ")})`,
      `$argumentLine = ($argumentValues | ForEach-Object { '"' + $_.Replace('"', '\\"') + '"' }) -join ' '`,
      `$process = Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentLine -WorkingDirectory ${powerShellLiteral(workingDirectory)} -WindowStyle Normal -PassThru`,
      `[Console]::Out.WriteLine($process.Id)`,
    ].join("\r\n"),
    "utf16le",
  ).toString("base64");

  const launcher = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encodedCommand],
    {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
      timeout: 10_000,
    },
  );
  if (launcher.error) throw launcher.error;
  if (launcher.status !== 0) throw new Error(launcher.stderr.trim() || "Windows could not open the PowerShell terminal.");
  const pid = Number.parseInt(launcher.stdout.trim().split(/\r?\n/).at(-1) ?? "", 10);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("The visible PowerShell terminal did not return a process ID.");
  return pid;
};
