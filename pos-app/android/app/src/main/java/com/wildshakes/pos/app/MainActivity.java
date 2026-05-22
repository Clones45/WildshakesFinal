package com.wildshakes.pos.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    private static final int CAMERA_PERMISSION_CODE = 1001;
    private static final int BLUETOOTH_PERMISSION_CODE = 1002;
    private PermissionRequest pendingWebPermission;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ── Request Bluetooth runtime permissions (Android 12+ only) ──────────
        // BLUETOOTH_CONNECT and BLUETOOTH_SCAN are runtime permissions on API 31+.
        // The plugin uses @SuppressLint("MissingPermission") so it won't request
        // them itself — we must do it here on startup.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            boolean connectGranted = ContextCompat.checkSelfPermission(this,
                    Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
            boolean scanGranted = ContextCompat.checkSelfPermission(this,
                    Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED;

            if (!connectGranted || !scanGranted) {
                ActivityCompat.requestPermissions(this, new String[]{
                        Manifest.permission.BLUETOOTH_CONNECT,
                        Manifest.permission.BLUETOOTH_SCAN
                }, BLUETOOTH_PERMISSION_CODE);
            }
        }

        // Extend BridgeWebChromeClient (NOT bare WebChromeClient) so Capacitor's
        // JavaScript bridge, file pickers, and other WebView features still work.
        bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean needsVideo = false;
                    for (String res : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                            needsVideo = true;
                            break;
                        }
                    }

                    if (!needsVideo) {
                        super.onPermissionRequest(request);
                        return;
                    }

                    boolean cameraGranted = ContextCompat.checkSelfPermission(
                            MainActivity.this, Manifest.permission.CAMERA)
                            == PackageManager.PERMISSION_GRANTED;

                    if (cameraGranted) {
                        request.grant(new String[]{ PermissionRequest.RESOURCE_VIDEO_CAPTURE });
                    } else {
                        pendingWebPermission = request;
                        ActivityCompat.requestPermissions(
                                MainActivity.this,
                                new String[]{ Manifest.permission.CAMERA },
                                CAMERA_PERMISSION_CODE
                        );
                    }
                });
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
                                           String[] permissions,
                                           int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == CAMERA_PERMISSION_CODE && pendingWebPermission != null) {
            if (grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingWebPermission.grant(new String[]{ PermissionRequest.RESOURCE_VIDEO_CAPTURE });
            } else {
                pendingWebPermission.deny();
            }
            pendingWebPermission = null;
        }
        // BLUETOOTH_PERMISSION_CODE: OS handles this automatically on startup prompt.
    }
}
