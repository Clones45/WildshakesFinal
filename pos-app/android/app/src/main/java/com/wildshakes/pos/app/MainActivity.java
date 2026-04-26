package com.wildshakes.pos.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    private static final int CAMERA_PERMISSION_CODE = 1001;
    private PermissionRequest pendingWebPermission;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Extend BridgeWebChromeClient (NOT bare WebChromeClient) so Capacitor's
        // JavaScript bridge, file pickers, and other WebView features still work.
        bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    // Check if this request includes VIDEO_CAPTURE
                    boolean needsVideo = false;
                    for (String res : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                            needsVideo = true;
                            break;
                        }
                    }

                    if (!needsVideo) {
                        // Not a camera request — let Capacitor's default handle it
                        super.onPermissionRequest(request);
                        return;
                    }

                    boolean cameraGranted = ContextCompat.checkSelfPermission(
                            MainActivity.this, Manifest.permission.CAMERA)
                            == PackageManager.PERMISSION_GRANTED;

                    if (cameraGranted) {
                        // OS permission already granted — grant only VIDEO_CAPTURE to WebView
                        request.grant(new String[]{ PermissionRequest.RESOURCE_VIDEO_CAPTURE });
                    } else {
                        // Ask the OS for CAMERA permission (no audio — QR only needs video)
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
                // User tapped Allow → grant VIDEO_CAPTURE to WebView
                pendingWebPermission.grant(new String[]{ PermissionRequest.RESOURCE_VIDEO_CAPTURE });
            } else {
                pendingWebPermission.deny();
            }
            pendingWebPermission = null;
        }
    }
}
