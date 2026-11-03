!macro customInstall
  DetailPrint "Configuring Windows Firewall for Restaurant POS..."
  nsExec::Exec 'netsh advfirewall firewall add rule name="Restaurant POS Server (3001)" dir=in action=allow protocol=TCP localport=3001 profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Restaurant POS Discovery (3002)" dir=in action=allow protocol=UDP localport=3002 profile=any'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Restaurant POS Server (3001)"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Restaurant POS Discovery (3002)"'
!macroend

