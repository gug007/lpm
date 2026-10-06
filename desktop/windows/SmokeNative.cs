// Win32 calls for smoke.ps1 (Add-Type -Path): the main window, real keystrokes
// through SendInput, the screen size for screenshots, std handle inheritance.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace LpmSmoke
{
    public static class Native
    {
        [StructLayout(LayoutKind.Sequential)]
        struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

        [StructLayout(LayoutKind.Sequential)]
        struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

        [StructLayout(LayoutKind.Explicit)]
        struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }

        [StructLayout(LayoutKind.Sequential)]
        struct INPUT { public uint type; public INPUTUNION u; }

        delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

        [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
        [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hwnd);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
        [DllImport("user32.dll")] static extern bool AttachThreadInput(uint attach, uint attachTo, bool doAttach);
        [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
        [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] inputs, int size);
        [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern short VkKeyScan(char ch);
        [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
        [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int which);
        [DllImport("kernel32.dll")] static extern bool GetHandleInformation(IntPtr handle, out uint flags);
        [DllImport("kernel32.dll")] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);

        public const ushort Shift = 0x10;
        public const ushort Control = 0x11;
        public const ushort Alt = 0x12;
        public const ushort Enter = 0x0D;

        public static IntPtr FindTopWindow(int processId, string title)
        {
            IntPtr found = IntPtr.Zero;
            EnumWindows((hwnd, lParam) =>
            {
                uint owner;
                GetWindowThreadProcessId(hwnd, out owner);
                if (owner != (uint)processId) return true;
                var text = new StringBuilder(512);
                GetWindowText(hwnd, text, text.Capacity);
                if (text.ToString() != title) return true;
                found = hwnd;
                return false;
            }, IntPtr.Zero);
            return found;
        }

        public static bool Visible(IntPtr hwnd) { return IsWindowVisible(hwnd); }

        public static void Close(IntPtr hwnd) { PostMessage(hwnd, 0x0010, IntPtr.Zero, IntPtr.Zero); }

        public static bool IsForeground(IntPtr hwnd) { return GetForegroundWindow() == hwnd; }

        // Windows refuses SetForegroundWindow to a process that is not in the
        // foreground; sharing the foreground thread's input state, then a held
        // Alt, are the two ways past that lock.
        public static bool BringToFront(IntPtr hwnd)
        {
            ShowWindow(hwnd, 9);
            if (TryForeground(hwnd)) return true;
            IntPtr current = GetForegroundWindow();
            uint ignored;
            uint foregroundThread = current == IntPtr.Zero ? 0 : GetWindowThreadProcessId(current, out ignored);
            uint thisThread = GetCurrentThreadId();
            bool attached = foregroundThread != 0 && foregroundThread != thisThread && AttachThreadInput(thisThread, foregroundThread, true);
            try
            {
                if (TryForeground(hwnd)) return true;
            }
            finally
            {
                if (attached) AttachThreadInput(thisThread, foregroundThread, false);
            }
            Key(Alt, false);
            SetForegroundWindow(hwnd);
            Key(Alt, true);
            return TryForeground(hwnd);
        }

        static bool TryForeground(IntPtr hwnd)
        {
            SetForegroundWindow(hwnd);
            BringWindowToTop(hwnd);
            Thread.Sleep(250);
            return GetForegroundWindow() == hwnd;
        }

        static void Key(ushort vk, bool up)
        {
            var input = new INPUT[1];
            input[0].type = 1;
            input[0].u.ki.wVk = vk;
            input[0].u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
            input[0].u.ki.dwFlags = up ? 2u : 0u;
            SendInput(1, input, Marshal.SizeOf(typeof(INPUT)));
        }

        public static void Chord(ushort[] modifiers, ushort vk)
        {
            foreach (var modifier in modifiers) Key(modifier, false);
            Key(vk, false);
            Key(vk, true);
            for (int i = modifiers.Length - 1; i >= 0; i--) Key(modifiers[i], true);
            Thread.Sleep(60);
        }

        public static void TypeText(string text)
        {
            foreach (char ch in text)
            {
                short scan = VkKeyScan(ch);
                if (scan == -1) throw new ArgumentException("no key types '" + ch + "' on this keyboard layout");
                int shiftState = (scan >> 8) & 0xff;
                var modifiers = new List<ushort>();
                if ((shiftState & 1) != 0) modifiers.Add(Shift);
                if ((shiftState & 2) != 0) modifiers.Add(Control);
                if ((shiftState & 4) != 0) modifiers.Add(Alt);
                Chord(modifiers.ToArray(), (ushort)(scan & 0xff));
            }
        }

        // Clears HANDLE_FLAG_INHERIT on stdin/stdout/stderr and returns which
        // ones had it, for RestoreStdInheritance.
        public static uint[] StopStdInheritance()
        {
            var had = new uint[3];
            for (int i = 0; i < 3; i++)
            {
                IntPtr handle = GetStdHandle(-10 - i);
                uint flags;
                had[i] = GetHandleInformation(handle, out flags) ? flags & 1u : 0u;
                if (had[i] != 0) SetHandleInformation(handle, 1u, 0u);
            }
            return had;
        }

        public static void RestoreStdInheritance(uint[] had)
        {
            for (int i = 0; i < 3; i++)
            {
                if (had[i] != 0) SetHandleInformation(GetStdHandle(-10 - i), 1u, 1u);
            }
        }

        public static int[] VirtualScreen()
        {
            SetProcessDPIAware();
            return new[] { GetSystemMetrics(76), GetSystemMetrics(77), GetSystemMetrics(78), GetSystemMetrics(79) };
        }
    }
}
