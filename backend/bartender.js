const express = require('express');
const router = express.Router();

// Ensure `fetch` is available on older Node versions
if (typeof fetch === 'undefined') {
  try {
    // node-fetch v2/v3 compat
    // eslint-disable-next-line global-require
    global.fetch = require('node-fetch');
  } catch (e) {
    console.warn('Global fetch is not available and node-fetch could not be loaded; remote BarTender API calls may fail.');
  }
}

let lastStatusStr = '';
let pollInterval = null;

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    return { raw: text };
  }
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function cmdQuoted(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

router.use((req, res, next) => {
  if (!pollInterval && req.io) {
    pollInterval = setInterval(async () => {
      try {
        const apiUrl = process.env.BARTENDER_API_URL || 'http://localhost:5159/api';
        const printerName = process.env.BARTENDER_PRINTER_NAME || 'Zebra_ZT411';
        const response = await fetch(`${apiUrl}/status?printer=${encodeURIComponent(printerName)}`);
        if (response.ok) {
          try {
            const data = await response.json();
            data.name = printerName;
            const currentStatusStr = JSON.stringify(data);
            if (currentStatusStr !== lastStatusStr) {
              lastStatusStr = currentStatusStr;
              req.io.emit('printer_status', data);
            }
          } catch (jsonErr) {
            // If response isn't JSON, just emit a minimal status
            const data = { name: printerName, status: 'Unknown', lastError: 'Invalid status response' };
            const currentStatusStr = JSON.stringify(data);
            if (currentStatusStr !== lastStatusStr) {
              lastStatusStr = currentStatusStr;
              req.io.emit('printer_status', data);
            }
          }
        } else {
          const data = {
            name: process.env.BARTENDER_PRINTER_NAME || 'Zebra_ZT411',
            status: 'Not Connected',
            totalPrinted: 0,
            successPrinted: 0,
            failedPrinted: 0,
            lastPrintStatus: 'Failed',
            lastError: `BarTender status check returned ${response.status}`
          };
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
          lastError: err && err.message ? err.message : 'Printer is offline'
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
    const response = await fetch(`${apiUrl}/status?printer=${encodeURIComponent(printerName)}`);
    
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
  const directNamedSources = req.body && (req.body.NamedDataSources || req.body.Variables);
  const qrCode = req.body.qrCode || (directNamedSources && (directNamedSources.QRCode || directNamedSources.qrCode));
  const sapCode = req.body.sapCode || (directNamedSources && (directNamedSources.SAPCode || directNamedSources.sapCode));
  const description = req.body.description || (directNamedSources && (directNamedSources.Description || directNamedSources.description));
  const printerConfig = req.body.printerConfig;
  const bodyPrinterName = req.body.printerName || req.body.Printer;
  
  if (!qrCode) {
    return res.status(400).json({ success: false, error: 'QR Code is required' });
  }

  // Use explicit request override, then frontend overrides, else fallback to .env
  const printerName = bodyPrinterName || (printerConfig && printerConfig.name) || (process.env.BARTENDER_PRINTER_NAME || 'Zebra_ZT411');
  // Default to CMD to avoid relying on BarTender REST API; can be overridden with env PRINT_METHOD or printerConfig.method
  const method = ((printerConfig && printerConfig.method) ? printerConfig.method : (process.env.PRINT_METHOD || 'cmd')).toLowerCase();

  try {
    const apiUrl = process.env.BARTENDER_API_URL || 'http://localhost:5159/api';

    // Strict Connectivity Check: Ensure printer is actually online before accepting the print job
    let isOffline = false;
    let offlineReason = '';

    try {
      const statusRes = await fetch(`${apiUrl}/status?printer=${encodeURIComponent(printerName)}`);
      if (statusRes.ok) {
        try {
          const statusData = await statusRes.json();
          const s = (statusData.status || '').toLowerCase();
          if (s.includes('offline') || s.includes('error') || s.includes('not connected') || s === 'paused') {
            isOffline = true;
            offlineReason = statusData.status;
          }
        } catch (jsonErr) {
          // If we can't parse JSON, don't assume offline; we'll attempt a print and report errors.
          console.warn('Unable to parse BarTender status JSON:', jsonErr.message);
        }
      } else {
        // Non-OK status from BarTender status endpoint; note it but allow fallback attempts
        offlineReason = `Status endpoint returned ${statusRes.status}`;
        console.warn('BarTender status check returned non-OK:', statusRes.status);
      }
    } catch (e) {
      // API is unreachable. If we are falling back to CMD, we can try to check Windows spooler status
      console.warn('BarTender status check failed:', e && e.message ? e.message : e);
      try {
        const util = require('util');
        const execAsync = util.promisify(require('child_process').exec);
        const { stdout } = await execAsync(`powershell -Command "(Get-PrintQueue -Name '${printerName}' -ErrorAction SilentlyContinue).Status"`);
        const psStatus = stdout.trim().toLowerCase();
        if (psStatus.includes('offline') || psStatus.includes('error')) {
          isOffline = true;
          offlineReason = psStatus;
        }
      } catch (psErr) {
        // Ignore if we can't run powershell, we will just have to attempt the print and surface errors
        console.warn('PowerShell check failed:', psErr && psErr.message ? psErr.message : psErr);
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
        const payload = {
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
        };

        console.log('Sending print request to BarTender API', apiUrl + '/print', payload);
        const response = await fetch(`${apiUrl}/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          apiSuccess = true;
          const data = await readResponseBody(response);
          if (req.io) req.io.emit('printer_event', { type: 'success', details: data });
          return res.json({ success: true, message: 'Printed successfully via API', details: data });
        } else {
          const data = await readResponseBody(response);
          apiErrorMsg = `Status ${response.status}: ${data.error || data.message || data.raw || response.statusText}`;
          console.warn('BarTender API print failed:', apiErrorMsg);
        }
      } catch (err) {
        apiErrorMsg = err && err.message ? err.message : String(err);
        console.warn('BarTender API print threw error:', apiErrorMsg);
      }
    }

    // 2. Fallback to CMD if API failed or CMD is requested
    if (!apiSuccess && (method === 'cmd' || method === 'auto')) {
      const { exec } = require('child_process');
      const fs = require('fs');
      const os = require('os');
      const path = require('path');

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
      
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanwise-bt-'));
      const dataPath = path.join(tempDir, `label-${Date.now()}.csv`);
      const csv = [
        'QRCode,SAPCode,Description',
        [csvCell(qrCode), csvCell(sapCode), csvCell(description)].join(',')
      ].join('\r\n');
      fs.writeFileSync(dataPath, csv, 'utf8');

      let cmdTemplate = process.env.PRINT_CMD_TEMPLATE;
      if (!cmdTemplate) {
         cmdTemplate = `${exePath} /AF=${cmdQuoted(labelPath)} /PRN=${cmdQuoted(printerName)} /D=${cmdQuoted(dataPath)} /P /DD /X`;
      }

      const finalCmd = cmdTemplate
        .replace(/\{\{QRCODE\}\}/g, String(qrCode).replace(/"/g, '""'))
        .replace(/\{\{SAPCODE\}\}/g, String(sapCode).replace(/"/g, '""'))
        .replace(/\{\{DESCRIPTION\}\}/g, String(description).replace(/"/g, '""'))
        .replace(/\{\{PRINTER_NAME\}\}/g, printerName)
        .replace(/\{\{LABEL_PATH\}\}/g, labelPath)
        .replace(/\{\{DATA_FILE\}\}/g, dataPath);

      console.log('Executing CMD Print Fallback:', finalCmd);

      exec(finalCmd, (error, stdout, stderr) => {
        try {
          if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
          if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          console.warn('Unable to clean temporary BarTender data file:', cleanupErr && cleanupErr.message ? cleanupErr.message : cleanupErr);
        }

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
