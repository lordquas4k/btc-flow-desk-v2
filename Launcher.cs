using System;
using System.Diagnostics;

class Launcher
{
    static void Main()
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;

        Process.Start(new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = "/c start.bat",
            WorkingDirectory = baseDir,
        });
    }
}
