const express = require('express');
const router = express.Router();

let lastStatusStr = '';
let pollInterval = null;

router.use((req, res, next) => {
  if (!pollInterval && req.io) {
    pollInterval = setInterval(async () => {
      try {
        const apiUrl = process.env.BARTENDER_API_URL || 'http://localhost:5159/api';
        const printerName = process.env.BARTENDER_PRINTER_NAME || 'Zebra_ZT411';
        const response = await fetch(`${apiUrl}/status?printer=${printerName}`);
        if (response.ok) {
          const data = await response.json();
          data.name = printerName;
          const currentStatusStr = JSON.stringify(data);
          if (currentStatusStr !== lastStatusStr) {
            lastStatusStr = currentStatusStr;
            req.io.emit('printer_status', data);
          }
        }
      } catch (err) {
        const data = {
          name: process.env.BARTENDER_PRINTER_NAME || 'Zebra_ZT411',
          status: 'Not Connected',
          totalPrinted: 0,
          successPrinted: 0,
          failedPrinted: 0,
          lastPrintStatus: 'Failed',
          lastError: 'Printer is offline'
        };
        const currentStatusStr = JSON.stringify(data);
        if (currentStatusStr !== lastStatusStr) {
          lastStatusStr = currentStatusStr;
          req.io.emit('printer_status', data);
        }
      }
    }, 2000);
  }
  next();
});

router.get('/status', async (req, res) => {
  try {
    const apiUrl = process.env.BARTENDER_API_URL || 'http://localhost:5159/api';
    const printerName = process.env.BARTENDER_PRINTER_NAME || 'Zebra_ZT411';
    
    // Attempt to fetch live status from BarTender API
    const response = await fetch(`${apiUrl}/status?printer=${printerName}`);
    
    if (!response.ok) throw new Error('BarTender API returned non-OK status');
    
    const data = await response.json();
    data.name = printerName;
    res.json(data);
  } catch (error) {
    res.json({
      name: process.env.BARTENDER_PRINTER_NAME || 'Zebra_ZT411',
      status: 'Not Connected',
      totalPrinted: 0,
      successPrinted: 0,
      failedPrinted: 0,
      lastPrintStatus: 'Failed',
      lastError: 'BarTender API Offline or Printer Not Connected'
    });
  }
});

router.post('/print', async (req, res) => {
  const { qrCode, sapCode, description, printerConfig } = req.body;
  
  if (!qrCode) {
    return res.status(400).json({ success: false, error: 'QR Code is required' });
  }

  // Use frontend overrides if provided, else fallback to .env
  const printerName = (printerConfig && printerConfig.name) ? printerConfig.name : (process.env.BARTENDER_PRINTER_NAME || 'Zebra_ZT411');
  const method = (printerConfig && printerConfig.method) ? printerConfig.method : (process.env.PRINT_METHOD || 'auto');

  try {
    const apiUrl = process.env.BARTENDER_API_URL || 'http://localhost:5159/api';
    
    // Strict Connectivity Check: Ensure printer is actually online before accepting the print job
    let isOffline = false;
    let offlineReason = '';

    try {
      const statusRes = await fetch(`${apiUrl}/status?printer=${printerName}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        // Check for explicitly offline statuses
        const s = (statusData.status || '').toLowerCase();
        if (s.includes('offline') || s.includes('error') || s.includes('not connected') || s === 'paused') {
          isOffline = true;
          offlineReason = statusData.status;
        }
      }
    } catch (e) {
      // API is unreachable. If we are falling back to CMD, we can try to check Windows spooler status
      try {
        const util = require('util');
        const execAsync = util.promisify(require('child_process').exec);
        // Quick PowerShell check for printer status. "Offline" or "Error" usually means it's not connected.
        const { stdout } = await execAsync(`powershell -Command "(Get-PrintQueue -Name '${printerName}' -ErrorAction SilentlyContinue).Status"`);
        const psStatus = stdout.trim().toLowerCase();
        if (psStatus.includes('offline') || psStatus.includes('error')) {
          isOffline = true;
          offlineReason = psStatus;
        }
      } catch (psErr) {
        // Ignore if we can't run powershell, we will just have to blindly attempt the print.
      }
    }

    if (isOffline) {
      if (req.io) req.io.emit('printer_event', { type: 'error', message: `Printer is offline (Status: ${offlineReason})` });
      return res.status(500).json({ success: false, error: `Printer is physically offline or disconnected (Status: ${offlineReason})` });
    }

    let apiSuccess = false;
    let apiErrorMsg = '';

    // 1. Try API if configured
    if (method === 'api' || method === 'auto') {
      try {
        const response = await fetch(`${apiUrl}/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Printer: printerName,
            NamedDataSources: {
              QRCode: qrCode,
              SAPCode: sapCode,
              Description: description
            },
            Variables: {
              QRCode: qrCode,
              SAPCode: sapCode,
              Description: description
            }
          })
        });

        if (response.ok) {
          apiSuccess = true;
          const data = await response.json();
          if (req.io) req.io.emit('printer_event', { type: 'success', details: data });
          return res.json({ success: true, message: 'Printed successfully via API', details: data });
        } else {
          apiErrorMsg = await response.text();
        }
      } catch (err) {
        apiErrorMsg = err.message;
      }
    }

    // 2. Fallback to CMD if API failed or CMD is requested
    if (!apiSuccess && (method === 'cmd' || method === 'auto')) {
      const { exec } = require('child_process');
      const fs = require('fs');

      // Attempt to auto-detect BarTender executable path
      const getExePath = () => {
        // First check frontend override
        if (printerConfig && printerConfig.exePath && fs.existsSync(printerConfig.exePath)) {
          return `"${printerConfig.exePath}"`;
        }
        // Then check backend .env override
        if (process.env.BARTENDER_EXE_PATH && fs.existsSync(process.env.BARTENDER_EXE_PATH)) {
          return `"${process.env.BARTENDER_EXE_PATH}"`;
        }
        // Then common locations
        const commonPaths = [
          'C:\\Program Files\\Seagull\\BarTender Suite\\bartend.exe',
          'C:\\Program Files\\Seagull\\BarTender 2022\\bartend.exe',
          'C:\\Program Files\\Seagull\\BarTender 2021\\bartend.exe',
          'C:\\Program Files\\Seagull\\BarTender 2019\\bartend.exe',
          'C:\\Program Files\\Seagull\\BarTender 12.0\\bartend.exe',
          'C:\\Program Files (x86)\\Seagull\\BarTender Suite\\bartend.exe'
        ];
        for (const p of commonPaths) {
          if (fs.existsSync(p)) return `"${p}"`;
        }
        return 'bartend.exe'; // Hope it is in the system PATH
      };

      const exePath = getExePath();
      
      // Use frontend override for label path, then .env
      const labelPath = (printerConfig && printerConfig.labelPath) ? printerConfig.labelPath : (process.env.BARTENDER_LABEL_PATH || 'C:\\Labels\\Template.btw');
      
      let cmdTemplate = process.env.PRINT_CMD_TEMPLATE;
      if (!cmdTemplate) {
         cmdTemplate = `${exePath} /F="${labelPath}" /PRN="${printerName}" /R="QRCode={{QRCODE}}" /R="SAPCode={{SAPCODE}}" /R="Description={{DESCRIPTION}}" /P /X`;
      }

      // Sanitize inputs to prevent command injection
      const cleanQr = String(qrCode).replace(/"/g, '""');
      const cleanSap = String(sapCode).replace(/"/g, '""');
      const cleanDesc = String(description).replace(/"/g, '""');

      const finalCmd = cmdTemplate
        .replace(/\{\{QRCODE\}\}/g, cleanQr)
        .replace(/\{\{SAPCODE\}\}/g, cleanSap)
        .replace(/\{\{DESCRIPTION\}\}/g, cleanDesc)
        .replace(/\{\{PRINTER_NAME\}\}/g, printerName);

      console.log('Executing CMD Print Fallback:', finalCmd);

      exec(finalCmd, (error, stdout, stderr) => {
        if (error) {
          console.error(`CMD Print Error: ${error.message}`);
          if (req.io) req.io.emit('printer_event', { type: 'error', message: `API & CMD Failed: ${error.message}` });
          return res.status(500).json({ success: false, error: 'Printer CMD execution failed', details: error.message });
        }
        
        console.log('CMD Print Success:', stdout);
        if (req.io) req.io.emit('printer_event', { type: 'success', details: { method: 'cmd', output: stdout } });
        res.json({ success: true, message: 'Printed successfully via CMD Fallback', details: { stdout } });
      });
      return; // Important: Return here to avoid sending multiple responses
    }

    // If we reach here and it's 'api' only
    if (!apiSuccess && method === 'api') {
      if (req.io) req.io.emit('printer_event', { type: 'error', message: `API Print Failed: ${apiErrorMsg}` });
      return res.status(500).json({ success: false, error: `Cannot connect to BarTender API: ${apiErrorMsg}` });
    }

  } catch (error) {
    console.error('BarTender Print Error:', error);
    if (req.io) req.io.emit('printer_event', { type: 'error', message: error.message });
    res.status(500).json({ success: false, error: 'Internal Print Error occurred' });
  }
});

module.exports = router;
