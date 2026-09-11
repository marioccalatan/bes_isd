"""Native Windows GUI launcher for BES (no runtime dependencies)."""
import ctypes, os, re, subprocess, sys, threading, time
from ctypes import wintypes
from datetime import datetime
from pathlib import Path

ROOT = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve().parent
LOG = ROOT / "bes_server.log"
PROD_LOG = ROOT / "bes_server_production.log"
PROD_STARTER = ROOT / "bes_server_production_start.cmd"
u, g, k, shell = ctypes.windll.user32, ctypes.windll.gdi32, ctypes.windll.kernel32, ctypes.windll.shell32
u.CreateWindowExW.restype = wintypes.HWND
u.CreateWindowExW.argtypes = [wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
                              ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.HWND,
                              wintypes.HMENU, wintypes.HINSTANCE, ctypes.c_void_p]
u.DefWindowProcW.restype = ctypes.c_ssize_t
u.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
u.LoadCursorW.restype = wintypes.HANDLE
u.LoadImageW.restype = wintypes.HANDLE
u.LoadImageW.argtypes = [wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.UINT,
                         ctypes.c_int, ctypes.c_int, wintypes.UINT]
u.SendMessageW.restype = ctypes.c_ssize_t
u.SendMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
k.GetModuleHandleW.restype = wintypes.HMODULE
k.CreateMutexW.restype = wintypes.HANDLE
k.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
k.GetLastError.restype = wintypes.DWORD
shell.ShellExecuteW.restype = ctypes.c_void_p
shell.ShellExecuteW.argtypes = [wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR, ctypes.c_int]
WM_DESTROY, WM_PAINT, WM_LBUTTONUP, WM_MOUSEWHEEL, WM_APP = 2, 0x0F, 0x202, 0x020A, 0x8000
LOG_VIEW_LINES = 13

def color(s):
    s=s.lstrip('#'); r,g,b=(int(s[i:i+2],16) for i in (0,2,4)); return r|(g<<8)|(b<<16)
BG,CARD,WHITE,MUTED,GREEN,RED,BLUE,PURPLE,AMBER=map(color,("#0b1120","#111827","#f8fafc","#94a3b8","#22c55e","#ef4444","#2563eb","#8b5cf6","#f59e0b"))

class RECT(ctypes.Structure): _fields_=[('left',wintypes.LONG),('top',wintypes.LONG),('right',wintypes.LONG),('bottom',wintypes.LONG)]
class PS(ctypes.Structure): _fields_=[('hdc',wintypes.HDC),('erase',wintypes.BOOL),('rect',RECT),('restore',wintypes.BOOL),('inc',wintypes.BOOL),('reserved',ctypes.c_byte*32)]
class DI(ctypes.Structure): _fields_=[('type',wintypes.UINT),('id',wintypes.UINT),('item',wintypes.UINT),('action',wintypes.UINT),('state',wintypes.UINT),('hwnd',wintypes.HWND),('hdc',wintypes.HDC),('rect',RECT),('data',ctypes.c_void_p)]
class WC(ctypes.Structure): _fields_=[('style',wintypes.UINT),('proc',ctypes.c_void_p),('ce',ctypes.c_int),('we',ctypes.c_int),('inst',wintypes.HINSTANCE),('icon',wintypes.HICON),('cursor',wintypes.HANDLE),('brush',wintypes.HBRUSH),('menu',wintypes.LPCWSTR),('name',wintypes.LPCWSTR)]

def pids(ports):
    try: out=subprocess.run(['netstat','-ano','-p','tcp'],capture_output=True,text=True,creationflags=0x08000000,timeout=8).stdout
    except Exception: return set()
    result=set()
    for line in out.splitlines():
        c=line.split(); m=re.search(r':(\d+)$',c[1]) if len(c)>=5 and c[-2].upper()=='LISTENING' else None
        if m and int(m.group(1)) in ports and c[-1].isdigit(): result.add(int(c[-1]))
    return result

def stop_ports(ports):
    found=pids(ports); ok=True
    for pid in found:
        ok &= subprocess.run(['taskkill','/PID',str(pid),'/T','/F'],capture_output=True,creationflags=0x08000000).returncode==0
    if found: time.sleep(1.5)
    return ok and not pids(ports)

def append_log(message, path=LOG):
    try:
        with path.open('a',encoding='utf-8') as log: log.write(message)
        return True
    except OSError:
        return False

def write_production_starter(script):
    started = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    PROD_STARTER.write_text(
        '@echo off\n'
        'setlocal EnableExtensions\n'
        f'cd /d "{ROOT}"\n'
        f'>> "{PROD_LOG}" echo.\n'
        f'>> "{PROD_LOG}" echo [{started}] Elevated production deploy started.\n'
        f'call "{script}" >> "{PROD_LOG}" 2>&1\n'
        'set "BES_EXIT=%ERRORLEVEL%"\n'
        f'>> "{PROD_LOG}" echo.\n'
        f'>> "{PROD_LOG}" echo [%DATE% %TIME%] Production deploy exited with code %BES_EXIT%.\n'
        'exit /b %BES_EXIT%\n',
        encoding='utf-8',
    )
    return PROD_STARTER

class App:
    def __init__(self):
        self.prod=self.busy=self.running=False; self.status='Checking server...'
        self.bg=g.CreateSolidBrush(BG); self.card=g.CreateSolidBrush(CARD)
        self.title=self.font(24,700); self.normal=self.font(16,400); self.bold=self.font(16,600); self.small=self.font(13,400); self.mono=self.font(13,400,'Consolas')
        self.log_lines=['No log output yet. Start or restart BES to see activity here.']
        self.log_scroll=0
        self.log_cleared_at=0
        self.log_ignore_lines=0
        self.pending_status_until=0
        self.cb=ctypes.WINFUNCTYPE(ctypes.c_ssize_t,wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM)(self.proc)
    def font(self,h,w,name='Segoe UI'): return g.CreateFontW(-h,0,0,0,w,0,0,0,1,0,0,5,0,name)
    def text(self,dc,s,r,c,font,flags=0x24):
        g.SetBkMode(dc,1); g.SetTextColor(dc,c); old=g.SelectObject(dc,font); u.DrawTextW(dc,s,-1,ctypes.byref(r),flags); g.SelectObject(dc,old)
    def run(self):
        icon_path = (Path(sys._MEIPASS) / 'bes-isd.ico' if getattr(sys, 'frozen', False)
                     else ROOT / 'public' / 'bes-isd.ico')
        self.icons = [u.LoadImageW(None, str(icon_path), 1, u.GetSystemMetrics(x),
                                  u.GetSystemMetrics(y), 0x10) for x, y in ((11, 12), (49, 50))]
        inst=k.GetModuleHandleW(None); wc=WC(0,ctypes.cast(self.cb,ctypes.c_void_p),0,0,inst,self.icons[0],u.LoadCursorW(None,32512),self.bg,None,'BesServerNative')
        atom=u.RegisterClassW(ctypes.byref(wc)); w,h=700,620
        self.hwnd=u.CreateWindowExW(0,'BesServerNative','BES Server',0x00CB0000,(u.GetSystemMetrics(0)-w)//2,(u.GetSystemMetrics(1)-h)//2,w,h,None,None,inst,None)
        for kind, icon in zip((1, 0), self.icons):
            if icon: u.SendMessageW(self.hwnd, 0x0080, kind, icon)
        if not atom or not self.hwnd:
            with LOG.open('a',encoding='utf-8') as debug: debug.write(f'Native window error: atom={atom}, hwnd={self.hwnd}, winerror={k.GetLastError()}\n')
        u.ShowWindow(self.hwnd,5); u.UpdateWindow(self.hwnd); threading.Thread(target=self.poll,daemon=True).start(); msg=wintypes.MSG()
        while u.GetMessageW(ctypes.byref(msg),None,0,0)>0: u.TranslateMessage(ctypes.byref(msg)); u.DispatchMessageW(ctypes.byref(msg))
    def proc(self,hwnd,msg,wp,lp):
        if msg==WM_DESTROY: u.PostQuitMessage(0); return 0
        if msg==WM_LBUTTONUP:
            x,y=lp&0xffff,(lp>>16)&0xffff
            if 438<=x<=540 and 297<=y<=325:
                log_path=self.log_path()
                try:
                    old_line_count=len(log_path.read_text(encoding='utf-8',errors='replace').splitlines())
                except OSError: old_line_count=0
                self.log_cleared_at=time.time()
                self.log_lines=['Logs cleared. Start or restart BES to see new activity here.']
                self.log_scroll=0
                self.status='Logs cleared'
                try:
                    log_path.write_text('',encoding='utf-8')
                    self.log_ignore_lines=0
                except OSError:
                    self.log_ignore_lines=old_line_count
                    try:
                        with log_path.open('a',encoding='utf-8') as log: log.write(f'\n[{datetime.now():%Y-%m-%d %H:%M:%S}] Logs cleared in launcher\n')
                    except OSError: pass
                u.InvalidateRect(hwnd,None,True)
            elif 548<=x<=650 and 297<=y<=325:
                try:
                    subprocess.run(['clip.exe'],input='\r\n'.join(self.log_lines),text=True,creationflags=0x08000000,check=True)
                    self.status='Logs copied to clipboard'
                except (OSError,subprocess.CalledProcessError): self.status='Unable to copy logs'
                u.InvalidateRect(hwnd,None,True)
            elif 576<=x<=628 and 110<=y<=138 and not self.busy:
                self.prod=not self.prod; self.log_ignore_lines=0; self.log_scroll=0; self.log_lines=['No log output yet. Start or restart BES to see activity here.']; u.InvalidateRect(hwnd,None,True)
            elif 56<=x<=336 and 219<=y<=264 and not self.busy:
                self.busy=True; self.status='Restarting...'; u.InvalidateRect(hwnd,None,True); threading.Thread(target=self.work,args=(True,),daemon=True).start()
            elif 348<=x<=628 and 219<=y<=264 and not self.busy:
                self.busy=True; self.status='Stopping...'; u.InvalidateRect(hwnd,None,True); threading.Thread(target=self.work,args=(False,),daemon=True).start()
            return 0
        if msg==WM_MOUSEWHEEL:
            delta=ctypes.c_short((wp>>16)&0xffff).value
            max_scroll=max(0,len(self.log_lines)-LOG_VIEW_LINES)
            if delta>0: self.log_scroll=min(max_scroll,self.log_scroll+3)
            elif delta<0: self.log_scroll=max(0,self.log_scroll-3)
            u.InvalidateRect(hwnd,None,True)
            return 0
        if msg in (WM_APP+1,WM_APP+2): u.InvalidateRect(hwnd,None,True); return 0
        if msg==WM_PAINT:
            ps=PS(); dc=u.BeginPaint(hwnd,ctypes.byref(ps)); self.paint(dc); u.EndPaint(hwnd,ctypes.byref(ps)); return 0
        return u.DefWindowProcW(hwnd,msg,wp,lp)
    def paint(self,dc):
        self.text(dc,'BES SERVER',RECT(0,24,684,58),WHITE,self.title,0x25); self.text(dc,'BENECO Enterprise System',RECT(0,61,684,82),MUTED,self.normal,0x25)
        u.FillRect(dc,ctypes.byref(RECT(34,91,650,284)),self.card)
        self.text(dc,'Environment',RECT(56,111,190,138),WHITE,self.bold)
        env='Production' if self.prod else 'Development'; self.text(dc,env,RECT(450,111,565,138),PURPLE if self.prod else BLUE,self.bold,0x26)
        brush=g.CreateSolidBrush(PURPLE if self.prod else BLUE); old=g.SelectObject(dc,brush); g.RoundRect(dc,576,110,628,138,28,28); g.SelectObject(dc,old); g.DeleteObject(brush)
        brush=g.CreateSolidBrush(WHITE); old=g.SelectObject(dc,brush); x=612 if self.prod else 590; g.Ellipse(dc,x-9,115,x+9,133); g.SelectObject(dc,old); g.DeleteObject(brush)
        brush=g.CreateSolidBrush(AMBER if self.busy else (GREEN if self.running else MUTED)); old=g.SelectObject(dc,brush); g.Ellipse(dc,57,169,67,179); g.SelectObject(dc,old); g.DeleteObject(brush)
        self.text(dc,self.status,RECT(75,159,230,190),WHITE,self.normal)
        detail='192.168.62.14:5000 | 192.168.10.14:5000' if self.prod else '127.0.0.1:5174'; self.text(dc,detail,RECT(395,159,628,190),MUTED,self.small,0x26)
        start_brush=g.CreateSolidBrush(color('#475569') if self.busy else GREEN); stop_brush=g.CreateSolidBrush(color('#475569') if self.busy else RED)
        u.FillRect(dc,ctypes.byref(RECT(56,219,336,264)),start_brush); u.FillRect(dc,ctypes.byref(RECT(348,219,628,264)),stop_brush); g.DeleteObject(start_brush); g.DeleteObject(stop_brush)
        self.text(dc,'Start / Restart',RECT(56,219,336,264),color('#04130a') if not self.busy else MUTED,self.bold,0x25); self.text(dc,'Stop',RECT(348,219,628,264),WHITE if not self.busy else MUTED,self.bold,0x25)
        self.text(dc,'Logs',RECT(34,301,650,326),WHITE,self.bold)
        clear_brush=g.CreateSolidBrush(color('#1e293b')); u.FillRect(dc,ctypes.byref(RECT(438,297,540,325)),clear_brush); g.DeleteObject(clear_brush)
        self.text(dc,'Clear Logs',RECT(438,297,540,325),color('#cbd5e1'),self.small,0x25)
        copy_brush=g.CreateSolidBrush(color('#1e293b')); u.FillRect(dc,ctypes.byref(RECT(548,297,650,325)),copy_brush); g.DeleteObject(copy_brush)
        self.text(dc,'Copy Logs',RECT(548,297,650,325),color('#cbd5e1'),self.small,0x25)
        log_brush=g.CreateSolidBrush(color('#070c16')); u.FillRect(dc,ctypes.byref(RECT(34,329,650,545)),log_brush); g.DeleteObject(log_brush)
        max_scroll=max(0,len(self.log_lines)-LOG_VIEW_LINES); self.log_scroll=min(self.log_scroll,max_scroll)
        end=len(self.log_lines)-self.log_scroll; start=max(0,end-LOG_VIEW_LINES); visible_lines=self.log_lines[start:end]
        for index,line in enumerate(visible_lines):
            lowered=line.lower(); line_color=RED if ('error' in lowered or 'failed' in lowered or 'exception' in lowered) else color('#cbd5e1')
            self.text(dc,line[:94],RECT(48,339+index*15,636,356+index*15),line_color,self.mono,0x20)
        if len(self.log_lines)>LOG_VIEW_LINES:
            track=g.CreateSolidBrush(color('#1e293b')); thumb=g.CreateSolidBrush(color('#64748b'))
            u.FillRect(dc,ctypes.byref(RECT(636,335,642,539)),track)
            thumb_h=max(28,int(204*LOG_VIEW_LINES/len(self.log_lines)))
            thumb_top=335 if max_scroll==0 else 335+int((204-thumb_h)*(max_scroll-self.log_scroll)/max_scroll)
            u.FillRect(dc,ctypes.byref(RECT(636,thumb_top,642,thumb_top+thumb_h)),thumb)
            g.DeleteObject(track); g.DeleteObject(thumb)
        self.text(dc,'Server controls apply to the selected environment.',RECT(0,559,684,584),MUTED,self.small,0x25)
    def ports(self): return (5000,) if self.prod else (5174,3001)
    def log_path(self): return PROD_LOG if self.prod else LOG
    def wait_ports_clear(self,ports,seconds=8):
        deadline=time.time()+seconds
        while time.time()<deadline:
            if not pids(ports): return True
            time.sleep(.5)
        return not pids(ports)
    def work(self,start):
        mode='production' if self.prod else 'development'
        ports=self.ports()
        should_stop=not start or (bool(pids(ports)) and not self.prod)
        stopped=(stop_ports(ports) and self.wait_ports_clear(ports)) if should_stop else True
        if not stopped: self.status='Stop failed - run as Administrator'
        elif not start: self.status=mode.title()+' stopped'
        else:
            script=ROOT/('deploy_bes_isd.bat' if self.prod else 'start-bes.bat')
            if not script.exists(): self.status='Missing '+script.name
            else:
                try:
                    log_path=self.log_path()
                    log_ready=append_log(f'\n[{datetime.now():%Y-%m-%d %H:%M:%S}] Starting {mode}\n', log_path)
                    if self.prod:
                        append_log('Administrator permission is required. Approve the Windows prompt to continue.\n', log_path)
                        if not log_ready: self.log_lines.append('Log file is temporarily unavailable; continuing production start.')
                    if self.prod:
                        starter=write_production_starter(script)
                        params=f'/d /c ""{starter}""'
                        result=shell.ShellExecuteW(self.hwnd,'runas','cmd.exe',params,str(ROOT),1) or 0
                        if result<=32: raise OSError('Administrator permission was declined or could not be requested.')
                        self.status='Production deploy started...'
                        self.pending_status_until=time.time()+1200
                    else:
                        log=log_path.open('a',encoding='utf-8',errors='replace')
                        subprocess.Popen(['cmd.exe','/d','/c',str(script)],cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,creationflags=0x08000000|0x00000200)
                        self.status=mode.title()+' is starting...'
                except OSError as e: self.status='Start failed: '+str(e)
        self.busy=False; u.PostMessageW(self.hwnd,WM_APP+1,0,0)
    def poll(self):
        while u.IsWindow(self.hwnd):
            try:
                lines=self.log_path().read_text(encoding='utf-8',errors='replace').splitlines()
                if self.log_ignore_lines: lines=lines[self.log_ignore_lines:]
                visible=[line for line in lines if line.strip()]
                if visible: self.log_lines=visible[-1000:]
            except OSError: pass
            if not self.busy:
                ports=self.ports(); active=[bool(pids((port,))) for port in ports]; self.running=all(active)
                if self.running:
                    self.pending_status_until=0
                    self.status='Running'
                elif any(active):
                    self.status='Partial startup'
                elif time.time()>=self.pending_status_until:
                    self.status='Stopped'
                u.PostMessageW(self.hwnd,WM_APP+2,0,0)
            time.sleep(2.5)

if __name__=='__main__':
    mutex=k.CreateMutexW(None,True,'Global\\BES_SERVER_LAUNCHER_SINGLE_INSTANCE')
    if k.GetLastError()==183:
        u.MessageBoxW(None,'BES Server launcher is already open.','BES Server',0x40)
        sys.exit(0)
    App().run()
