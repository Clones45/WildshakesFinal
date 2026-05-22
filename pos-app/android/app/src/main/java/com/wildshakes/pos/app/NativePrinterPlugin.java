package com.wildshakes.pos.app;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.util.Base64;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.util.UUID;

@CapacitorPlugin(name = "NativePrinter")
public class NativePrinterPlugin extends Plugin {

    private final UUID applicationUUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void printBase64(PluginCall call) {
        String address = call.getString("address");
        String base64Data = call.getString("data");

        if (address == null || base64Data == null) {
            call.reject("Must provide address and base64 data");
            return;
        }

        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) {
                call.reject("Bluetooth not supported");
                return;
            }

            BluetoothDevice device = adapter.getRemoteDevice(address);
            BluetoothSocket socket = device.createRfcommSocketToServiceRecord(applicationUUID);
            
            socket.connect();

            int counter = 0;
            while (!socket.isConnected()) {
                counter++;
                if (counter > 15) {
                    call.reject("Could not connect to printer");
                    return;
                }
                Thread.sleep(100);
            }

            OutputStream stream = socket.getOutputStream();
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            stream.write(bytes);
            stream.flush();

            // Unblock the POS app UI immediately so the cashier can continue working!
            call.resolve();

            // Keep the socket open in a background thread so the Android Bluetooth
            // stack has time to finish transmitting the image data before disconnecting.
            new Thread(() -> {
                try {
                    Thread.sleep(2500);
                    socket.close();
                } catch (Exception e) {
                    // Ignore background cleanup errors
                }
            }).start();

        } catch (Exception e) {
            call.reject("Print failed: " + e.getMessage());
        }
    }
}
