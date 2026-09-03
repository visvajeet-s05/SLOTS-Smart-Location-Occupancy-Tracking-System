# Test Fixtures Directory

This directory contains test data for empirical benchmarking.

## Required Files

### test_sample_hsrp.jpg
A real sample image of an Indian license plate (HSRP format) for VLM testing.

**To create this file:**
1. Take a photo of an Indian license plate (e.g., TN-01-AB-1234)
2. Save it as `test_sample_hsrp.jpg` in this directory
3. Ensure the image is clear and the plate is visible

**Alternative:** The benchmark script will use a base64-encoded placeholder if the file is not found.
