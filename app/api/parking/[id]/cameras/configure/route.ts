import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/parking/[id]/cameras/configure
 * 
 * Configure multiple mobile IP cameras for different zones
 * 
 * Body: {
 *   "cameras": [
 *     {
 *       "name": "Zone A Camera (Moto G45)",
 *       "url": "http://192.168.1.100:8080/video",
 *       "zones": ["A"],
 *       "positionX": 50,
 *       "positionY": 50,
 *       "coverageRadius": 10,
 *       "cameraType": "MOBILE_IP"
 *     }
 *   ]
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lotId } = await params;
    const body = await req.json();
    const { cameras } = body;

    if (!Array.isArray(cameras)) {
      return NextResponse.json(
        { error: 'cameras must be an array' },
        { status: 400 }
      );
    }

    // Verify parking lot exists
    const parkingLot = await prisma.parkinglot.findUnique({
      where: { id: lotId }
    });

    if (!parkingLot) {
      return NextResponse.json(
        { error: 'Parking lot not found' },
        { status: 404 }
      );
    }

    const createdCameras = [];
    const zoneMappings = [];

    for (const cameraConfig of cameras) {
      const {
        name,
        url,
        zones = [],
        positionX,
        positionY,
        coverageRadius,
        cameraType = 'IP_CAMERA'
      } = cameraConfig;

      if (!name || !url) {
        return NextResponse.json(
          { error: 'Each camera must have name and url' },
          { status: 400 }
        );
      }

      // Create camera
      const camera = await prisma.camera.create({
        data: {
          lotId,
          name,
          url,
          zones: zones.join(','), // Store as comma-separated string
          positionX,
          positionY,
          coverageRadius,
          cameraType,
          isActive: true
        }
      });

      createdCameras.push(camera);

      // Create zone mappings
      for (const zoneCode of zones) {
        const mapping = await prisma.cameraZoneMapping.create({
          data: {
            cameraId: camera.id,
            zoneCode,
            priority: 0
          }
        });
        zoneMappings.push(mapping);
      }
    }

    return NextResponse.json({
      success: true,
      lotId,
      cameras: createdCameras,
      zoneMappings,
      message: `Successfully configured ${createdCameras.length} cameras`
    });

  } catch (error: any) {
    console.error('[CAMERA_CONFIGURE] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/parking/[id]/cameras/configure
 * 
 * Get all camera configurations for a parking lot
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lotId } = await params;

    const cameras = await prisma.camera.findMany({
      where: { lotId },
      include: {
        zoneMappings: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Transform zone mappings back to array format
    const camerasWithZones = cameras.map(camera => ({
      ...camera,
      zones: camera.zoneMappings.map(mapping => mapping.zoneCode),
      zoneMappings: undefined // Remove the nested relation
    }));

    return NextResponse.json({
      success: true,
      lotId,
      cameras: camerasWithZones
    });

  } catch (error: any) {
    console.error('[CAMERA_CONFIGURE_GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/parking/[id]/cameras/configure
 * 
 * Update camera configuration
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lotId } = await params;
    const body = await req.json();
    const { cameraId, ...updateData } = body;

    if (!cameraId) {
      return NextResponse.json(
        { error: 'cameraId is required' },
        { status: 400 }
      );
    }

    // Verify camera belongs to this lot
    const existingCamera = await prisma.camera.findFirst({
      where: {
        id: cameraId,
        lotId
      }
    });

    if (!existingCamera) {
      return NextResponse.json(
        { error: 'Camera not found in this parking lot' },
        { status: 404 }
      );
    }

    // Handle zones array conversion
    if (updateData.zones && Array.isArray(updateData.zones)) {
      updateData.zones = updateData.zones.join(',');
      
      // Update zone mappings
      await prisma.cameraZoneMapping.deleteMany({
        where: { cameraId }
      });

      for (const zoneCode of updateData.zones.split(',')) {
        await prisma.cameraZoneMapping.create({
          data: {
            cameraId,
            zoneCode: zoneCode.trim(),
            priority: 0
          }
        });
      }
    }

    const updatedCamera = await prisma.camera.update({
      where: { id: cameraId },
      data: updateData,
      include: {
        zoneMappings: true
      }
    });

    return NextResponse.json({
      success: true,
      camera: {
        ...updatedCamera,
        zones: updatedCamera.zoneMappings.map(m => m.zoneCode),
        zoneMappings: undefined
      }
    });

  } catch (error: any) {
    console.error('[CAMERA_CONFIGURE_PUT] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/parking/[id]/cameras/configure
 * 
 * Delete a camera configuration
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lotId } = await params;
    const { searchParams } = new URL(req.url);
    const cameraId = searchParams.get('cameraId');

    if (!cameraId) {
      return NextResponse.json(
        { error: 'cameraId query parameter is required' },
        { status: 400 }
      );
    }

    // Verify camera belongs to this lot
    const existingCamera = await prisma.camera.findFirst({
      where: {
        id: cameraId,
        lotId
      }
    });

    if (!existingCamera) {
      return NextResponse.json(
        { error: 'Camera not found in this parking lot' },
        { status: 404 }
      );
    }

    // Delete camera (cascade will delete zone mappings)
    await prisma.camera.delete({
      where: { id: cameraId }
    });

    return NextResponse.json({
      success: true,
      message: 'Camera deleted successfully'
    });

  } catch (error: any) {
    console.error('[CAMERA_CONFIGURE_DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}