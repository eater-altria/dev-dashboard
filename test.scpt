tell application "Calendar"
	set theCal to first calendar whose writable is true
	set dStart to (current date)
	set year of dStart to 2026
	set month of dStart to 4
	set day of dStart to 11
	set hours of dStart to 0
	set minutes of dStart to 0
	set seconds of dStart to 0
	
	set dEnd to (current date)
	set year of dEnd to 2026
	set month of dEnd to 4
	set day of dEnd to 11
	set hours of dEnd to 23
	set minutes of dEnd to 59
	set seconds of dEnd to 59
	
	make new event at end of events of theCal with properties {summary:"Test Todo Script", start date:dStart, end date:dEnd}
end tell
