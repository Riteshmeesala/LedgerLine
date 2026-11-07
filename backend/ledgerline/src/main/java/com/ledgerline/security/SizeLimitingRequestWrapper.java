package com.ledgerline.security;

import com.ledgerline.exception.PayloadTooLargeException;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

import java.io.IOException;

public class SizeLimitingRequestWrapper extends HttpServletRequestWrapper {

    private final int maxBytes;

    public SizeLimitingRequestWrapper(HttpServletRequest request, int maxBytes) {
        super(request);
        this.maxBytes = maxBytes;
    }

    @Override
    public ServletInputStream getInputStream() throws IOException {
        ServletInputStream original = super.getInputStream();
        return new ServletInputStream() {
            private int bytesRead = 0;

            @Override
            public boolean isFinished() {
                return original.isFinished();
            }

            @Override
            public boolean isReady() {
                return original.isReady();
            }

            @Override
            public void setReadListener(ReadListener readListener) {
                original.setReadListener(readListener);
            }

            @Override
            public int read() throws IOException {
                int b = original.read();
                if (b != -1) {
                    bytesRead++;
                    if (bytesRead > maxBytes) {
                        throw new PayloadTooLargeException("Request payload exceeds maximum allowed size of " + maxBytes + " bytes.");
                    }
                }
                return b;
            }

            @Override
            public int read(byte[] b, int off, int len) throws IOException {
                int n = original.read(b, off, len);
                if (n > 0) {
                    bytesRead += n;
                    if (bytesRead > maxBytes) {
                        throw new PayloadTooLargeException("Request payload exceeds maximum allowed size of " + maxBytes + " bytes.");
                    }
                }
                return n;
            }
        };
    }
}

