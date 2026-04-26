package com.wildshakes.pos.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int CAMERA_PERMISSION_CODE = 1001;
    private PermissionRequest pendingWebPermission;

    @Override
    public void onStart() {
        super.onStart();

        bridge.getWebView().setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    // Check if Android OS camera permission is already granted
                    boolean cameraGranted = ContextCompat.checkSelfPermission(
                            MainActivity.this, Manifest.permission.CAMERA)
                            == PackageManager.PERMISSION_GRANTED;

                    if (cameraGranted) {
                        // OS permission already granted — let the WebView use it
                        request.grant(request.getResources());
                    } else {
                        // Hold the WebView request and ask the OS for permission first
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
                // User tapped Allow — now grant the WebView access too
                pendingWebPermission.grant(pendingWebPermission.getResources());
            } else {
                // User tapped Deny — reject the WebView request so we show an error
                pendingWebPermission.deny();
            }
            pendingWebPermission = null;
        }
    }
}
