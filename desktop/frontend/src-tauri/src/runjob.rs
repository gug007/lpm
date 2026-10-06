// Every process one run starts, so a cancel can end them all. A parent-pid walk
// misses MSYS tools: their fork goes through a stub that exits, leaving the
// grandchild's recorded parent a pid that no longer exists. Job membership is
// inherited at creation whatever the parentage, so the job holds them all.
use std::os::windows::io::AsRawHandle;
use std::process::Child;

use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, TerminateJobObject,
};

pub struct RunJob(HANDLE);

// The handle is only ever passed to thread-safe kernel calls.
unsafe impl Send for RunJob {}
unsafe impl Sync for RunJob {}

impl RunJob {
    /// A job holding `child` and everything it starts from now on. None when
    /// the job can't be made; the caller falls back to the tree walk. The job
    /// must not allow breakaway: MSYS starts every child outside any job that
    /// lets it.
    pub fn attach(child: &Child) -> Option<Self> {
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return None;
            }
            let job = RunJob(handle);
            (AssignProcessToJobObject(handle, child.as_raw_handle() as HANDLE) != 0).then_some(job)
        }
    }

    pub fn terminate(&self) {
        unsafe {
            TerminateJobObject(self.0, 1);
        }
    }
}

impl Drop for RunJob {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
