'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, RefreshCw, Camera, Video, MapPin, Settings } from 'lucide-react';

interface CameraConfig {
  id?: string;
  name: string;
  url: string;
  zones: string[];
  positionX?: number;
  positionY?: number;
  coverageRadius?: number;
  cameraType: string;
  isActive: boolean;
}

interface MultiCameraConfigProps {
  lotId: string;
  onSave?: (cameras: CameraConfig[]) => void;
}

export default function MultiCameraConfig({ lotId, onSave }: MultiCameraConfigProps) {
  const [cameras, setCameras] = useState<CameraConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available zones (can be customized based on blueprint)
  const availableZones = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];

  useEffect(() => {
    loadCameraConfigs();
  }, [lotId]);

  const loadCameraConfigs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/parking/${lotId}/cameras/configure`);
      const data = await response.json();

      if (data.success) {
        setCameras(data.cameras || []);
      } else {
        setError('Failed to load camera configurations');
      }
    } catch (err) {
      setError('Error loading camera configurations');
      console.error('Error loading camera configs:', err);
    } finally {
      setLoading(false);
    }
  };

  const addCamera = () => {
    const newCamera: CameraConfig = {
      name: `Camera ${cameras.length + 1}`,
      url: '',
      zones: [],
      cameraType: 'MOBILE_IP',
      isActive: true,
      positionX: 50,
      positionY: 50,
      coverageRadius: 10
    };
    setCameras([...cameras, newCamera]);
  };

  const removeCamera = (index: number) => {
    const updatedCameras = cameras.filter((_, i) => i !== index);
    setCameras(updatedCameras);
  };

  const updateCamera = (index: number, field: keyof CameraConfig, value: any) => {
    const updatedCameras = [...cameras];
    updatedCameras[index] = { ...updatedCameras[index], [field]: value };
    setCameras(updatedCameras);
  };

  const toggleZone = (cameraIndex: number, zone: string) => {
    const updatedCameras = [...cameras];
    const currentZones = updatedCameras[cameraIndex].zones;
    
    if (currentZones.includes(zone)) {
      updatedCameras[cameraIndex].zones = currentZones.filter(z => z !== zone);
    } else {
      updatedCameras[cameraIndex].zones = [...currentZones, zone];
    }
    
    setCameras(updatedCameras);
  };

  const saveConfigurations = async () => {
    try {
      setSaving(true);
      setError(null);

      // Validate configurations
      for (const camera of cameras) {
        if (!camera.name || !camera.url) {
          setError('All cameras must have a name and URL');
          return;
        }
        if (camera.zones.length === 0) {
          setError('Each camera must be assigned to at least one zone');
          return;
        }
      }

      const response = await fetch(`/api/parking/${lotId}/cameras/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameras })
      });

      const data = await response.json();

      if (data.success) {
        // Reload configurations to get server-assigned IDs
        await loadCameraConfigs();
        if (onSave) {
          onSave(cameras);
        }
      } else {
        setError('Failed to save camera configurations');
      }
    } catch (err) {
      setError('Error saving camera configurations');
      console.error('Error saving camera configs:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteCamera = async (cameraId: string) => {
    try {
      const response = await fetch(`/api/parking/${lotId}/cameras/configure?cameraId=${cameraId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadCameraConfigs();
      } else {
        setError('Failed to delete camera');
      }
    } catch (err) {
      setError('Error deleting camera');
      console.error('Error deleting camera:', err);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
            <span className="ml-2">Loading camera configurations...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Multi-Camera Configuration</h2>
          <p className="text-gray-600">Configure mobile IP cameras for different parking zones</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadCameraConfigs} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={addCamera}>
            <Plus className="h-4 w-4 mr-2" />
            Add Camera
          </Button>
          <Button onClick={saveConfigurations} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save All'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Camera Cards */}
      <div className="grid gap-6">
        {cameras.map((camera, index) => (
          <Card key={camera.id || index}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  {camera.name}
                  {camera.isActive ? (
                    <Badge variant="default" className="ml-2">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="ml-2">Inactive</Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={camera.isActive}
                    onCheckedChange={(checked) => updateCamera(index, 'isActive', checked)}
                  />
                  {camera.id && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteCamera(camera.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  {!camera.id && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeCamera(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {/* Basic Configuration */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor={`camera-name-${index}`}>Camera Name</Label>
                    <Input
                      id={`camera-name-${index}`}
                      value={camera.name}
                      onChange={(e) => updateCamera(index, 'name', e.target.value)}
                      placeholder="e.g., Zone A Camera (Moto G45)"
                    />
                  </div>

                  <div>
                    <Label htmlFor={`camera-url-${index}`}>Camera Stream URL</Label>
                    <Input
                      id={`camera-url-${index}`}
                      value={camera.url}
                      onChange={(e) => updateCamera(index, 'url', e.target.value)}
                      placeholder="http://192.168.1.100:8080/video"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Mobile IP camera stream URL (e.g., IP Webcam app URL)
                    </p>
                  </div>

                  <div>
                    <Label htmlFor={`camera-type-${index}`}>Camera Type</Label>
                    <Select
                      value={camera.cameraType}
                      onValueChange={(value) => updateCamera(index, 'cameraType', value)}
                    >
                      <SelectTrigger id={`camera-type-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MOBILE_IP">Mobile IP Camera</SelectItem>
                        <SelectItem value="IP_CAMERA">IP Camera</SelectItem>
                        <SelectItem value="CCTV">CCTV</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Zone Assignment */}
                <div className="space-y-4">
                  <div>
                    <Label>Assigned Zones</Label>
                    <p className="text-xs text-gray-500 mb-2">
                      Select zones this camera will monitor
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {availableZones.map((zone) => (
                        <Badge
                          key={zone}
                          variant={camera.zones.includes(zone) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleZone(index, zone)}
                        >
                          Zone {zone}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Physical Position */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor={`pos-x-${index}`}>Position X</Label>
                      <Input
                        id={`pos-x-${index}`}
                        type="number"
                        value={camera.positionX || ''}
                        onChange={(e) => updateCamera(index, 'positionX', parseFloat(e.target.value))}
                        placeholder="50"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`pos-y-${index}`}>Position Y</Label>
                      <Input
                        id={`pos-y-${index}`}
                        type="number"
                        value={camera.positionY || ''}
                        onChange={(e) => updateCamera(index, 'positionY', parseFloat(e.target.value))}
                        placeholder="50"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`coverage-${index}`}>Coverage (m)</Label>
                      <Input
                        id={`coverage-${index}`}
                        type="number"
                        value={camera.coverageRadius || ''}
                        onChange={(e) => updateCamera(index, 'coverageRadius', parseFloat(e.target.value))}
                        placeholder="10"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Physical position on blueprint (for automated calibration)
                  </p>
                </div>
              </div>

              {/* Camera Preview */}
              {camera.url && (
                <div className="mt-4 pt-4 border-t">
                  <Label>Camera Preview</Label>
                  <div className="mt-2 bg-black rounded-lg overflow-hidden aspect-video">
                    <img
                      src={camera.url}
                      alt={camera.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100%25" height="100%25"%3E%3Crect fill="%23000" width="100%25" height="100%25"/%3E%3Ctext fill="%23666" font-family="sans-serif" font-size="16" dy="10.5" font-weight="bold" text-anchor="middle" x="50%25" y="50%25"%3ECamera Unavailable%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {cameras.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Camera className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Cameras Configured</h3>
            <p className="text-gray-600 mb-4">
              Add your first mobile IP camera to begin monitoring your parking zones
            </p>
            <Button onClick={addCamera}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Camera
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Configuration Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuration Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <Video className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <strong>Mobile IP Camera Setup:</strong>
                <p className="text-gray-600">
                  Install an IP Webcam app (like IP Webcam) on your mobile device.
                  Configure the app to stream video and note the URL (e.g., http://192.168.1.100:8080/video).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <strong>Zone Assignment:</strong>
                <p className="text-gray-600">
                  Assign each camera to specific parking zones. For Spencer Plaza,
                  use Zone A for the Moto G45 and Zone B for the Vivo T2X.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Camera className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <strong>Physical Position:</strong>
                <p className="text-gray-600">
                  Enter the physical position of each camera on your blueprint.
                  This helps the automated calibration system map camera coordinates to slot coordinates.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}