const ServiceRequest = require('../models/ServiceRequest');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const SupplierWallet = require('../models/SupplierWallet');
const SystemSetting = require('../models/SystemSetting');
const PhysicalBin = require('../models/PhysicalBin');
const OrderItem = require('../models/OrderItem');
const { sendPushNotifications } = require('../utils/pushNotification');
const Bill = require('../models/Bill');
const fs = require('fs');
const path = require('path');

// Create service request (customer orders bins - supports multiple bins)
const createServiceRequest = async (req, res) => {
  const cleanupFile = () => {
    if (req.file) {
      const filePath = path.join(__dirname, '../uploads', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  };

  try {
    let {
      service_category,
      bins, // Array of { bin_type_id, bin_size_id, quantity? }
      location,
      start_date,
      end_date,
      payment_method = 'online', // Default to online
      contact_number,
      contact_email,
      instructions,
      latitude,
      longitude,
      selected_services,
      estimated_price,
    } = req.body;
    
    console.log(`Booking request category: ${service_category}`);
    console.log(`Booking coordinates: lat=${latitude}, lon=${longitude}`);
    console.log(`Booking location text: ${location}`);

    // Handle stringified JSON from FormData
    if (typeof bins === 'string') {
      try {
        bins = JSON.parse(bins);
      } catch (e) {
        console.error('Error parsing bins JSON:', e);
      }
    }
    if (typeof selected_services === 'string') {
      try {
        selected_services = JSON.parse(selected_services);
      } catch (e) {
        console.error('Error parsing selected_services JSON:', e);
      }
    }

    const attachment_url = req.file ? `/uploads/${req.file.filename}` : null;
    const customerId = req.user.id;
    const requestId = `REQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 7).toUpperCase()}`;

    let qualifiedSuppliers = [];
    let orderItems = [];
    let finalEstimatedPrice = parseFloat(estimated_price) || 0;

    if (service_category === 'service') {
      // Find suppliers covering the location for general services
      qualifiedSuppliers = await User.findQualifiedSuppliersForService(latitude, longitude, location);
    } else {
      // Validation and supplier search for bins
      if (bins && Array.isArray(bins) && bins.length > 0) {
        orderItems = bins.map(bin => ({
          bin_type_id: parseInt(bin.bin_type_id),
          bin_size_id: bin.bin_size_id ? parseInt(bin.bin_size_id) : null,
          quantity: parseInt(bin.quantity) || 1,
        }));
      } else if (req.body.bin_type_id && req.body.bin_size_id) {
        orderItems = [{
          bin_type_id: parseInt(req.body.bin_type_id),
          bin_size_id: parseInt(req.body.bin_size_id),
          quantity: 1,
        }];
      } else {
        cleanupFile();
        return res.status(400).json({
          success: false,
          message: 'Bins are required for residential or commercial bookings.',
        });
      }

      qualifiedSuppliers = await User.findQualifiedSuppliersForMultipleBins(orderItems, latitude, longitude, location);
      if (qualifiedSuppliers.length > 0 && !finalEstimatedPrice) {
        finalEstimatedPrice = parseFloat(qualifiedSuppliers[0].total_price) || 0;
      }
    }

    if (qualifiedSuppliers.length === 0) {
      cleanupFile();
      return res.status(404).json({
        success: false,
        message: 'Service unavailable: No suppliers found in your area',
      });
    }

    const firstBin = orderItems.length > 0 ? orderItems[0] : null;

    const serviceRequest = await ServiceRequest.create({
      request_id: requestId,
      customer_id: customerId,
      service_category,
      bin_type_id: firstBin ? parseInt(firstBin.bin_type_id) : null,
      bin_size_id: firstBin && firstBin.bin_size_id ? parseInt(firstBin.bin_size_id) : null,
      location,
      start_date,
      end_date,
      attachment_url,
      estimated_price: finalEstimatedPrice,
      payment_method,
      contact_number,
      contact_email,
      instructions,
      latitude,
      longitude,
      selected_services,
    });

    // Create order items for bins if any
    const createdOrderItems = [];
    if (orderItems.length > 0) {
      for (const item of orderItems) {
        for (let i = 0; i < (item.quantity || 1); i++) {
          const orderItem = await OrderItem.create({
            service_request_id: serviceRequest.id,
            bin_type_id: parseInt(item.bin_type_id),
            bin_size_id: (item.bin_size_id && item.bin_size_id !== 'null') ? parseInt(item.bin_size_id) : null,
            status: 'pending',
          });
          createdOrderItems.push(orderItem);
        }
      }
    }

    const fullRequest = await ServiceRequest.findById(serviceRequest.id);
    const items = await OrderItem.findByServiceRequest(serviceRequest.id);

    // Emit notification to qualified suppliers
    const io = req.app.get('io');
    if (io && qualifiedSuppliers.length > 0) {
      qualifiedSuppliers.forEach((supplier) => {
        let message = '';
        if (service_category === 'service') {
          message = `New service request available near ${fullRequest.location}`;
        } else {
          message = items.length > 1
            ? `New request for ${items.length} bins available near ${fullRequest.location}`
            : `New request: ${fullRequest.bin_type_name} - ${fullRequest.bin_size} available near ${fullRequest.location}`;
        }

        const payload = {
          request: {
            ...fullRequest,
            items: items
          },
          message,
        };
        io.to(`supplier_${supplier.id}`).emit('new_request', payload);
      });

      const pushTokens = qualifiedSuppliers.map(s => s.pushToken).filter(token => token);
      if (pushTokens.length > 0) {
        const title = 'New Request';
        let body = '';
        if (service_category === 'service') {
          body = `New service request available near ${fullRequest.location}`;
        } else {
          body = items.length > 1
            ? `New request for ${items.length} bins available near ${fullRequest.location}`
            : `New request: ${fullRequest.bin_type_name} available near ${fullRequest.location}`;
        }

        sendPushNotifications(pushTokens, title, body, {
          requestId: fullRequest.id,
          type: 'new_request'
        }).catch(err => console.error('Push notification error:', err));
      }
    }

    res.status(201).json({
      success: true,
      message: 'Service request created successfully',
      data: {
        request: fullRequest,
        qualifiedSuppliersCount: qualifiedSuppliers.length
      },
    });
  } catch (error) {
    cleanupFile();
    console.error('Create service request error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating service request',
      error: error.message,
    });
  }
};

// Get customer's service requests
const getMyRequests = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { status } = req.query;

    const requests = await ServiceRequest.findByCustomer(customerId, { status });

    res.json({
      success: true,
      data: { requests },
    });
  } catch (error) {
    console.error('Get my requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching requests',
      error: error.message,
    });
  }
};

// Get supplier's or driver's requests
const getSupplierRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { status } = req.query;

    let requests;
    if (role === 'driver') {
      requests = await ServiceRequest.findAll({ driver_id: userId, status });
    } else {
      requests = await ServiceRequest.findBySupplier(userId, { status });
    }

    res.json({
      success: true,
      data: { requests },
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching jobs',
      error: error.message,
    });
  }
};

// Get pending requests for suppliers
const getPendingRequests = async (req, res) => {
  try {
    const supplierId = req.user.id;
    const requests = await ServiceRequest.findPendingForSuppliers(supplierId);

    // Fetch order items for each request
    const requestsWithItems = await Promise.all(
      requests.map(async (request) => {
        const orderItems = await OrderItem.findByServiceRequest(request.id);
        return {
          ...request,
          orderItems,
        };
      })
    );

    res.json({
      success: true,
      data: { requests: requestsWithItems },
    });
  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending requests',
      error: error.message,
    });
  }
};

// Get single request
const getRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await ServiceRequest.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found',
      });
    }

    // Fetch order items if any
    const orderItems = await OrderItem.findByServiceRequest(id);
    request.orderItems = orderItems;

    res.json({
      success: true,
      data: { request },
    });
  } catch (error) {
    console.error('Get request error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching request',
      error: error.message,
    });
  }
};

// Accept service request (supplier accepts) - directly confirms order
const acceptRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const supplierId = req.user.id;

    const request = await ServiceRequest.findById(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found',
      });
    }

    if (request.supplier_id && request.supplier_id !== supplierId) {
      return res.status(403).json({
        success: false,
        message: 'This request is already assigned to another supplier',
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Request cannot be accepted in current status',
      });
    }

    // Use the admin-approved price stored in the request
    const totalAmount = parseFloat(request.estimated_price);

    if (isNaN(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid price not found for this request. Please contact support.',
      });
    }
    const paymentMethod = request.payment_method || 'online';

    // Update request to confirmed with supplier
    await ServiceRequest.update(id, {
      supplier_id: supplierId,
      status: 'confirmed',
    });

    // Create a bill for the confirmed booking
    const billId = `BILL-${Date.now().toString(36).toUpperCase()}`;
    await Bill.create({
      bill_id: billId,
      service_request_id: id,
      customer_id: request.customer_id,
      supplier_id: supplierId,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'online' ? 'paid' : 'unpaid'
    });

    const updatedRequest = await ServiceRequest.findById(id);

    let transaction = null;
    let netAmount = null;

    // Process payment based on payment method
    if (paymentMethod === 'online') {
      // Online payment: process immediately
      const commissionSetting = await SystemSetting.findByKey('platform_commission_percentage');
      const commissionPercentage = commissionSetting
        ? parseFloat(commissionSetting.value) / 100
        : 0.15;

      const commissionAmount = totalAmount * commissionPercentage;
      netAmount = totalAmount - commissionAmount;

      // Create transaction
      const transactionId = `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 7).toUpperCase()}`;
      transaction = await Transaction.create({
        transaction_id: transactionId,
        customer_id: request.customer_id,
        supplier_id: supplierId,
        booking_id: request.request_id,
        amount: totalAmount,
        commission_amount: commissionAmount,
        net_amount: netAmount,
        payment_method: 'stripe',
        payment_status: 'completed',
        transaction_type: 'payment',
        description: `Payment for ${request.request_id}`,
      });

      // Update request payment status
      await ServiceRequest.update(id, {
        payment_status: 'paid',
      });

      // Credit supplier wallet
      const wallet = await SupplierWallet.getOrCreate(supplierId);
      await SupplierWallet.addCredit(
        wallet.id,
        netAmount,
        transaction.id,
        id,
        `Payment for ${request.request_id}`
      );
    } else {
      // Cash payment: will be collected when delivered
      await ServiceRequest.update(id, {
        payment_status: 'pending',
      });
    }

    // Notify customer
    const io = req.app.get('io');
    if (io) {
      io.to(`customer_${request.customer_id}`).emit('request_accepted', {
        request: updatedRequest,
      });

      if (transaction && netAmount !== null) {
        io.to(`supplier_${supplierId}`).emit('payment_received', {
          request: updatedRequest,
          transaction,
          amount: netAmount,
        });
      }

      // Notify supplier to refresh lists
      io.to(`supplier_${supplierId}`).emit('status_update', {
        request: updatedRequest,
        status: 'accepted'
      });
    }

    res.json({
      success: true,
      message: 'Request accepted and confirmed successfully',
      data: {
        request: updatedRequest,
        transaction: transaction || null
      },
    });
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({
      success: false,
      message: 'Error accepting request',
      error: error.message,
    });
  }
};

// Update request status
const updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, bin_codes } = req.body; // bin_codes array required when status is 'on_delivery' (loaded)
    const PhysicalBin = require('../models/PhysicalBin');
    const OrderItem = require('../models/OrderItem');
    const Transaction = require('../models/Transaction');
    const SupplierWallet = require('../models/SupplierWallet');
    const SystemSetting = require('../models/SystemSetting');
    const pool = require('../config/database');

    const cleanupFile = () => {
      if (req.file) {
        const filePath = path.join(__dirname, '../uploads', req.file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    };

    const request = await ServiceRequest.findById(id);
    if (!request) {
      cleanupFile();
      return res.status(404).json({
        success: false,
        message: 'Service request not found',
      });
    }

    // Validate user can only update their own requests
    if (req.user.role === 'supplier' && request.supplier_id !== req.user.id) {
      cleanupFile();
      return res.status(403).json({
        success: false,
        message: 'You can only update your own requests',
      });
    }

    if (req.user.role === 'driver' && request.driver_id !== req.user.id) {
      cleanupFile();
      return res.status(403).json({
        success: false,
        message: 'You can only update jobs assigned to you',
      });
    }

    // When status changes to 'on_delivery' (loaded), supplier must assign bins for all order items
    if (status === 'on_delivery') {
      // Get all order items for this request
      const orderItems = await OrderItem.findByServiceRequest(id);

      if (orderItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No order items found for this request',
        });
      }

      // Support legacy single bin_code format AND handle JSON stringified arrays from FormData
      let binCodesArray = [];
      if (Array.isArray(bin_codes)) {
        binCodesArray = bin_codes;
      } else if (typeof bin_codes === 'string' && bin_codes.startsWith('[')) {
        try {
          binCodesArray = JSON.parse(bin_codes);
        } catch (e) {
          binCodesArray = [bin_codes];
        }
      } else if (bin_codes) {
        binCodesArray = [bin_codes];
      } else if (req.body.bin_code) {
        binCodesArray = [req.body.bin_code];
      }

      if (binCodesArray.length !== orderItems.length) {
        return res.status(400).json({
          success: false,
          message: `Please assign bins for all ${orderItems.length} order item(s). Received ${binCodesArray.length} bin code(s).`,
        });
      }

      // Check for duplicate bin codes in the assignment
      const uniqueBinCodes = new Set(binCodesArray);
      if (uniqueBinCodes.size !== binCodesArray.length) {
        const duplicates = binCodesArray.filter((code, index) => binCodesArray.indexOf(code) !== index);
        return res.status(400).json({
          success: false,
          message: `Duplicate bin codes detected: ${[...new Set(duplicates)].join(', ')}. Each bin can only be assigned to one order item.`,
        });
      }

      // Check if any bins are already assigned to other order items (in this or other requests)
      const binIds = [];
      const binCodeToIdMap = {};
      for (const binCode of binCodesArray) {
        const bin = await PhysicalBin.findByCode(binCode);
        if (bin) {
          binIds.push(bin.id);
          binCodeToIdMap[binCode] = bin.id;
        }
      }

      if (binIds.length > 0) {
        const pool = require('../config/database');

        // Check if bins are assigned to other requests
        const alreadyAssignedQuery = `
          SELECT oi.id, oi.service_request_id, pb.bin_code
          FROM order_items oi
          INNER JOIN physical_bins pb ON oi.physical_bin_id = pb.id
          WHERE oi.physical_bin_id = ANY($1)
            AND oi.status NOT IN ('completed', 'cancelled')
            AND oi.service_request_id != $2
        `;
        const alreadyAssigned = await pool.query(alreadyAssignedQuery, [binIds, id]);

        if (alreadyAssigned.rows.length > 0) {
          const assignedBins = alreadyAssigned.rows.map(r => r.bin_code).join(', ');
          return res.status(400).json({
            success: false,
            message: `The following bin(s) are already assigned to another order: ${assignedBins}`,
          });
        }

        // Check if any bins are already assigned to other order items in the SAME request
        const sameRequestQuery = `
          SELECT oi.id, pb.bin_code
          FROM order_items oi
          INNER JOIN physical_bins pb ON oi.physical_bin_id = pb.id
          WHERE oi.physical_bin_id = ANY($1)
            AND oi.service_request_id = $2
            AND oi.physical_bin_id IS NOT NULL
        `;
        const sameRequestAssigned = await pool.query(sameRequestQuery, [binIds, id]);

        if (sameRequestAssigned.rows.length > 0) {
          const assignedBins = sameRequestAssigned.rows.map(r => r.bin_code).join(', ');
          return res.status(400).json({
            success: false,
            message: `The following bin(s) are already assigned to other items in this order: ${assignedBins}`,
          });
        }
      }

      // Validate and assign each bin
      for (let i = 0; i < orderItems.length; i++) {
        const orderItem = orderItems[i];
        const binCode = binCodesArray[i];

        // Find the bin by code and verify it belongs to the supplier
        const bin = await PhysicalBin.findByCode(binCode);
        if (!bin) {
          return res.status(404).json({
            success: false,
            message: `Bin with code ${binCode} not found`,
          });
        }

        if (bin.supplier_id !== request.supplier_id) {
          return res.status(403).json({
            success: false,
            message: `Bin ${binCode} does not belong to you`,
          });
        }

        if (bin.status !== 'available') {
          return res.status(400).json({
            success: false,
            message: `Bin ${binCode} is not available`,
          });
        }

        // Verify bin matches order item requirements (Type and Size)
        const typeMatch = bin.bin_type_id === orderItem.bin_type_id;

        // Handle null sizes for both bin and order item correctly
        const binSizeId = bin.bin_size_id === null ? null : parseInt(bin.bin_size_id);
        const orderItemSizeId = orderItem.bin_size_id === null ? null : parseInt(orderItem.bin_size_id);
        const sizeMatch = binSizeId === orderItemSizeId;

        if (!typeMatch || !sizeMatch) {
          return res.status(400).json({
            success: false,
            message: `Bin ${binCode} does not match order item requirements (Type: ${orderItem.bin_type_name}, Size: ${orderItem.bin_size || 'None'})`,
          });
        }

        // Update order item with bin assignment
        await OrderItem.update(orderItem.id, {
          physical_bin_id: bin.id,
          status: 'loaded',
        });

        // Update bin status to loaded
        await PhysicalBin.update(bin.id, {
          status: 'loaded',
          current_customer_id: request.customer_id,
          current_service_request_id: id,
        });
      }

      // Update request status
      await ServiceRequest.update(id, {
        status: 'on_delivery',
      });
    } else {
      // Update request status
      const updateData = { status };

      // If delivery photo is uploaded, add it to the update data
      if (status === 'delivered' && req.file) {
        updateData.delivery_photo_url = `/uploads/${req.file.filename}`;
      }

      await ServiceRequest.update(id, updateData);
    }

    const updatedRequest = await ServiceRequest.findById(id);

    // Get all order items for this request
    const orderItems = await OrderItem.findByServiceRequest(id);

    // Update order item and bin statuses based on order status
    if (orderItems.length > 0) {
      let orderItemStatus = null;
      let binStatus = null;
      let clearBinAssignment = false;

      // Map service request status to order item and bin status
      switch (status) {
        case 'on_delivery':
          orderItemStatus = 'loaded';
          binStatus = 'loaded';
          break;
        case 'cash_collected':
          orderItemStatus = 'cash_collected';
          binStatus = 'loaded'; // Bin is still on truck/with supplier but cash is collected

          // If cash order, collect payment now
          if (request.payment_method === 'cash' && request.payment_status === 'pending') {
            const commissionSetting = await SystemSetting.findByKey('platform_commission_percentage');
            const commissionPercentage = commissionSetting
              ? parseFloat(commissionSetting.value) / 100
              : 0.15;

            const totalAmount = parseFloat(request.total_price || request.estimated_price || 0);
            const commissionAmount = totalAmount * commissionPercentage;
            const netAmountValue = totalAmount - commissionAmount;

            // Create transaction
            const transactionId = `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 7).toUpperCase()}`;
            const transactionRecord = await Transaction.create({
              transaction_id: transactionId,
              customer_id: request.customer_id,
              supplier_id: request.supplier_id,
              booking_id: request.id,
              amount: totalAmount,
              commission_amount: commissionAmount,
              net_amount: netAmountValue,
              payment_method: 'cash',
              payment_status: 'completed',
              transaction_type: 'payment',
              description: `Cash payment collected for ${request.request_id}`,
            });

            // Update request payment status
            await ServiceRequest.update(id, {
              payment_status: 'paid',
            });

            // Update associated bill status
            const bill = await Bill.findByServiceRequestId(id);
            if (bill) {
              await Bill.update(bill.id, {
                payment_status: 'paid',
                paid_at: new Date()
              });
            }

            // Deduct commission from supplier wallet (since they already collected full cash)
            const wallet = await SupplierWallet.getOrCreate(request.supplier_id);
            await SupplierWallet.addDebit(
              wallet.id,
              commissionAmount,
              transactionRecord.id,
              id,
              `Platform commission for cash payment ${request.request_id}`
            );
          }
          break;
        case 'delivered':
          orderItemStatus = 'delivered';
          binStatus = 'delivered';
          break;
        case 'ready_to_pickup':
          orderItemStatus = 'ready_to_pickup';
          binStatus = 'ready_to_pickup';
          break;
        case 'pickup':
          orderItemStatus = 'picked_up';
          binStatus = 'picked_up';
          break;
        case 'completed':
          orderItemStatus = 'completed';
          binStatus = 'available';
          clearBinAssignment = true;
          break;
        case 'cancelled':
          orderItemStatus = 'pending'; // Reset to pending
          binStatus = 'available';
          clearBinAssignment = true;
          break;
      }

      // Update all order items and their associated bins
      for (const orderItem of orderItems) {
        if (orderItemStatus) {
          await OrderItem.update(orderItem.id, { status: orderItemStatus });
        }

        if (orderItem.physical_bin_id) {
          const binUpdates = {};
          if (binStatus) {
            binUpdates.status = binStatus;
          }
          if (clearBinAssignment) {
            binUpdates.current_customer_id = null;
            binUpdates.current_service_request_id = null;
          }
          if (Object.keys(binUpdates).length > 0) {
            await PhysicalBin.update(orderItem.physical_bin_id, binUpdates);
          }
        }
      }
    } else if (updatedRequest.bin_id) {
      // Legacy support: handle single bin assignment
      let binStatus = null;
      let clearBinAssignment = false;

      switch (status) {
        case 'on_delivery':
          binStatus = 'loaded';
          break;
        case 'delivered':
          binStatus = 'delivered';
          break;
        case 'ready_to_pickup':
          binStatus = 'ready_to_pickup';
          break;
        case 'pickup':
          binStatus = 'picked_up';
          break;
        case 'completed':
          binStatus = 'available';
          clearBinAssignment = true;
          break;
        case 'cancelled':
          binStatus = 'available';
          clearBinAssignment = true;
          break;
      }

      if (binStatus) {
        const binUpdates = { status: binStatus };
        if (clearBinAssignment) {
          binUpdates.current_customer_id = null;
          binUpdates.current_service_request_id = null;
        }
        await PhysicalBin.update(updatedRequest.bin_id, binUpdates);
      }
    }

    // Notify customer using the user_${id} room to match frontend
    const io = req.app.get('io');
    if (io && updatedRequest) {
      io.to(`user_${updatedRequest.customer_id}`).emit('status_update', {
        booking_id: updatedRequest.id,
        status: updatedRequest.status,
        message: `Your booking #${updatedRequest.request_id.slice(-5).toUpperCase()} status is now ${updatedRequest.status.replace(/_/g, ' ')}`,
        request: updatedRequest,
      });
    }

    // Push Notification to Customer
    if (updatedRequest.customer_push_token) {
      const title = 'Booking Status Updated';
      const body = `Your booking #${updatedRequest.request_id.slice(-5).toUpperCase()} status is now ${updatedRequest.status.replace(/_/g, ' ')}`;

      sendPushNotifications(updatedRequest.customer_push_token, title, body, {
        requestId: updatedRequest.id,
        status: updatedRequest.status,
        type: 'status_update'
      }).catch(err => console.error('Push notification error:', err));
    }

    res.json({
      success: true,
      message: 'Request status updated successfully',
      data: { request: updatedRequest },
    });
  } catch (error) {
    console.log('Update request status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating request status',
      error: error.message,
    });
  }
};


// Get order items for a service request
const getOrderItems = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await ServiceRequest.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found',
      });
    }

    // Validate access
    if (req.user.role === 'customer' && request.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own requests',
      });
    }

    if (req.user.role === 'supplier' && request.supplier_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own requests',
      });
    }

    const orderItems = await OrderItem.findByServiceRequest(id);

    res.json({
      success: true,
      data: { orderItems },
    });
  } catch (error) {
    console.error('Get order items error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order items',
      error: error.message,
    });
  }
};

// Customer: Mark order as ready to pickup
const markReadyToPickup = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = req.user.id;

    const request = await ServiceRequest.findById(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found',
      });
    }

    if (request.customer_id !== customerId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own requests',
      });
    }

    if (request.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Order must be delivered before marking as ready to pickup',
      });
    }

    // Update request status
    await ServiceRequest.update(id, { status: 'ready_to_pickup' });

    // Update order items and bins
    const orderItems = await OrderItem.findByServiceRequest(id);
    for (const orderItem of orderItems) {
      await OrderItem.update(orderItem.id, { status: 'ready_to_pickup' });
      if (orderItem.physical_bin_id) {
        await PhysicalBin.update(orderItem.physical_bin_id, { status: 'ready_to_pickup' });
      }
    }

    const updatedRequest = await ServiceRequest.findById(id);

    // Notify supplier
    const io = req.app.get('io');
    if (io && request.supplier_id) {
      io.to(`supplier_${request.supplier_id}`).emit('status_update', {
        booking_id: updatedRequest.id,
        status: updatedRequest.status,
        message: `Your booking #${updatedRequest.request_id.slice(-5).toUpperCase()} is now ready for pickup`,
        request: updatedRequest,
      });
    }

    // Push Notification to Supplier
    if (updatedRequest.supplier_push_token) {
      const title = 'Bin Ready for Pickup';
      const body = `Bin(s) at ${updatedRequest.location} are ready for pickup.`;

      sendPushNotifications(updatedRequest.supplier_push_token, title, body, {
        requestId: updatedRequest.id,
        type: 'ready_to_pickup'
      }).catch(err => console.error('Push notification error:', err));
    }

    res.json({
      success: true,
      message: 'Order marked as ready to pickup',
      data: { request: updatedRequest },
    });
  } catch (error) {
    console.error('Mark ready to pickup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking order as ready to pickup',
      error: error.message,
    });
  }
};

// Admin: Get all service requests
const getAllServiceRequests = async (req, res) => {
  try {
    const { status, customer_id, supplier_id, limit } = req.query;

    const requests = await ServiceRequest.findAll({
      status,
      customer_id,
      supplier_id,
      limit: limit ? parseInt(limit) : undefined,
    });

    res.json({
      success: true,
      data: { requests },
    });
  } catch (error) {
    console.error('Get all service requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching service requests',
      error: error.message,
    });
  }
};

module.exports = {
  createServiceRequest,
  getMyRequests,
  getSupplierRequests,
  getPendingRequests,
  getRequestById,
  acceptRequest,
  updateRequestStatus,
  getOrderItems,
  markReadyToPickup,
  getAllServiceRequests,
};
