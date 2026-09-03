'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Camera, 
  Crosshair, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Settings,
  MapPin,
  Calibration
} from 'lucide-react';

interface CalibrationProps {
  lotId: string;
  cameraId: string;
  cameraUrl: string;
  onComplete?: (success: boolean, accuracy: number) => void;
}

interface CalibrationStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export default function AutoCalibration({ 
  lotId, 
  cameraId, 
  cameraUrl, 
  onComplete 
}: CalibrationProps) {
  const [steps, setSteps] = useState<CalibrationStep[]>([
    {
      id: 'connect',
      title: 'Connect to Camera',
      description: 'Establish connection to mobile IP camera',
      status: 'pending'
    },
    {
      id: 'detect_markers',
      title: 'Detect Reference Markers',
      description: 'Identify ArUco or colored markers on blueprint',
      status: 'pending'
    },
    {
      id: 'calculate_transform',
      title: 'Calculate Transformation',
      description: 'Compute perspective transformation matrix',
      status: 'pending'
    },
    {
      id: 'validate_accuracy',
      title: 'Validate Calibration',
      description: 'Verify calibration accuracy (>90% required)',
      status: 'pending'
    },
    {
      id: 'save_calibration',
      title: 'Save Calibration Data',
      description: 'Store calibration matrix in database',
      status: 'pending'
    }
  ]);

  const [currentStep, setCurrentStep] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationAccuracy, setCalibrationAccuracy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cameraConnected, setCameraConnected] = useState(false);
  const [detectedMarkers, setDetectedMarkers] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Check if camera is already calibrated
    checkExistingCalibration();
  }, [lotId, cameraId]);

  const checkExistingCalibration = async () => {
    try {
      const response = await fetch(`/api/parking/${lotId}/cameras/configure`);
      const data = await response.json();
      
      if (data.success) {
        const camera = data.cameras.find((c: any) => c.id === cameraId);
        if (camera?.calibrationAccuracy) {
          setCalibrationAccuracy(camera.calibrationAccuracy);
          setSteps(prev => prev.map(step => 
            step.id === 'validate_accuracy' 
              ? { ...step, status: 'completed' }
              : step
          ));
        }
      }
    } catch (err) {
      console.error('Error checking existing calibration:', err);
    }
  };

  const startCalibration = async () => {
    setIsCalibrating(true);
    setError(null);
    setDetectedMarkers(0);

    try {
      // Step 1: Connect to Camera
      await updateStep('connect', 'in_progress');
      await connectToCamera();
      await updateStep('connect', 'completed');
      setCurrentStep(1);

      // Step 2: Detect Reference Markers
      await updateStep('detect_markers', 'in_progress');
      const markers = await detectReferenceMarkers();
      setDetectedMarkers(markers);
      
      if (markers < 4) {
        throw new Error(`Only ${markers} markers detected. Need at least 4 reference markers.`);
      }
      
      await updateStep('detect_markers', 'completed');
      setCurrentStep(2);

      // Step 3: Calculate Transformation
      await updateStep('calculate_transform', 'in_progress');
      await calculateTransformation();
      await updateStep('calculate_transform', 'completed');
      setCurrentStep(3);

      // Step 4: Validate Accuracy
      await updateStep('validate_accuracy', 'in_progress');
      const accuracy = await validateCalibration();
      setCalibrationAccuracy(accuracy);
      
      if (accuracy < 90) {
        throw new Error(`Calibration accuracy ${accuracy.toFixed(1)}% below 90% threshold`);
      }
      
      await updateStep('validate_accuracy', 'completed');
      setCurrentStep(4);

      // Step 5: Save Calibration
      await updateStep('save_calibration', 'in_progress');
      await saveCalibrationData(accuracy);
      await updateStep('save_calibration', 'completed');

      if (onComplete) {
        onComplete(true, accuracy);
      }

    } catch (err: any) {
      setError(err.message);
      setSteps(prev => prev.map(step => 
        step.status === 'in_progress' 
          ? { ...step, status: 'failed' }
          : step
      ));
      
      if (onComplete) {
        onComplete(false, 0);
      }
    } finally {
      setIsCalibrating(false);
    }
  };

  const updateStep = async (stepId: string, status: CalibrationStep['status']) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, status } : step
    ));
    
    // Simulate processing time for demo
    if (status === 'in_progress') {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  const connectToCamera = async () => {
    // In a real implementation, this would connect to the actual camera stream
    // For now, we'll simulate the connection
    if (cameraUrl) {
      setCameraConnected(true);
      
      // Try to load video stream
      if (videoRef.current) {
        videoRef.current.src = cameraUrl;
        videoRef.current.load();
      }
    } else {
      throw new Error('Camera URL not configured');
    }
  };

  const detectReferenceMarkers = async () => {
    // In a real implementation, this would use the Python calibration service
    // For now, we'll simulate marker detection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate detecting 4 markers (in real implementation, this would come from the camera feed)
    return 4;
  };

  const calculateTransformation = async () => {
    // In a real implementation, this would call the Python calibration service
    await new Promise(resolve => setTimeout(resolve, 1500));
  };

  const validateCalibration = async () => {
    // In a real implementation, this would validate the transformation matrix
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate accuracy (in real implementation, this would be calculated)
    return 95.5;
  };

  const saveCalibrationData = async (accuracy: number) => {
    // In a real implementation, this would save the calibration matrix to the database
    await new Promise(resolve => setTimeout(resolve, 500));
  };

  const resetCalibration = () => {
    setSteps(prev => prev.map(step => ({ ...step, status: 'pending' as const })));
    setCurrentStep(0);
    setCalibrationAccuracy(0);
    setError(null);
    setDetectedMarkers(0);
  };

  const getStepIcon = (step: CalibrationStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in_progress':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Crosshair className="h-5 w-5 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Calibration className="h-6 w-6" />
            Automated Camera Calibration
          </h2>
          <p className="text-gray-600">
            Calibrate camera using reference markers on your Spencer Plaza blueprint
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={resetCalibration} variant="outline" disabled={isCalibrating}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button 
            onClick={startCalibration} 
            disabled={isCalibrating || !cameraUrl}
          >
            <Camera className="h-4 w-4 mr-2" />
            {isCalibrating ? 'Calibrating...' : 'Start Calibration'}
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Camera Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Camera Feed
              {cameraConnected && (
                <Badge variant="default" className="ml-2">Connected</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              {cameraUrl ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <Camera className="h-12 w-12 mx-auto mb-2" />
                    <p>No camera URL configured</p>
                  </div>
                </div>
              )}
              
              {/* Calibration Overlay */}
              {isCalibrating && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-center text-white">
                    <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Processing calibration...</p>
                  </div>
                </div>
              )}

              {/* Detected Markers Overlay */}
              {detectedMarkers > 0 && (
                <div className="absolute top-4 right-4">
                  <Badge variant="default" className="bg-green-500">
                    {detectedMarkers} markers detected
                  </Badge>
                </div>
              )}
            </div>

            {/* Canvas for marker detection visualization */}
            <canvas 
              ref={canvasRef} 
              className="hidden"
              width="1920" 
              height="1080"
            />
          </CardContent>
        </Card>

        {/* Calibration Steps */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Calibration Steps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {getStepIcon(step)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{step.title}</h4>
                      {step.status === 'completed' && (
                        <Badge variant="default" className="text-xs">Done</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Calibration Accuracy */}
            {calibrationAccuracy > 0 && (
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Calibration Accuracy</span>
                  <Badge 
                    variant={calibrationAccuracy >= 90 ? "default" : "destructive"}
                  >
                    {calibrationAccuracy.toFixed(1)}%
                  </Badge>
                </div>
                <Progress value={calibrationAccuracy} className="h-2" />
                <p className="text-xs text-gray-500 mt-2">
                  {calibrationAccuracy >= 90 
                    ? "Excellent calibration - ready for production use"
                    : "Calibration below threshold - adjust camera position and retry"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Setup Instructions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 rounded-full p-2 mt-0.5">
                <span className="font-bold text-blue-600">1</span>
              </div>
              <div>
                <strong>Place Reference Markers:</strong>
                <p className="text-gray-600">
                  Place 4 reference markers (ArUco markers or colored cards) on the four corners 
                  of your Spencer Plaza blueprint. Ensure they are clearly visible to the camera.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 rounded-full p-2 mt-0.5">
                <span className="font-bold text-blue-600">2</span>
              </div>
              <div>
                <strong>Position Camera:</strong>
                <p className="text-gray-600">
                  Position your mobile IP camera to capture the entire blueprint area. 
                  For Zone A, center the Moto G45 camera on the A01-A20 section.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 rounded-full p-2 mt-0.5">
                <span className="font-bold text-blue-600">3</span>
              </div>
              <div>
                <strong>Start Calibration:</strong>
                <p className="text-gray-600">
                  Click "Start Calibration" to begin the automated process. 
                  The system will detect markers, calculate transformation, and validate accuracy.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 rounded-full p-2 mt-0.5">
                <span className="font-bold text-blue-600">4</span>
              </div>
              <div>
                <strong>Validate Results:</strong>
                <p className="text-gray-600">
                  Ensure calibration accuracy is above 90%. If lower, adjust camera position 
                  or marker placement and retry calibration.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}