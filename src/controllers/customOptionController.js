const CustomOption = require('../models/customOptionModel');

// 获取所有自定义选项
exports.getCustomOptions = async (req, res) => {
    const userId = req.user;
    try {
        const options = await CustomOption.findByUserId(userId);
        res.status(200).json({ options });
    } catch (error) {
        console.error('Get custom options error:', error);
        res.status(500).json({ message: 'Server error while fetching custom options.' });
    }
};

// 添加自定义选项
exports.addCustomOption = async (req, res) => {
    const { optionType, value } = req.body;
    const userId = req.user;

    if (!optionType || !value) {
        return res.status(400).json({ message: 'Option type and value are required.' });
    }

    try {
        const newOption = await CustomOption.create(userId, optionType, value);
        res.status(201).json({ message: 'Custom option added successfully.', option: newOption });
    } catch (error) {
        console.error('Add custom option error:', error);
        if (error.message.includes('Option already exists')) {
            return res.status(409).json({ message: error.message }); // Conflict
        }
        res.status(500).json({ message: 'Server error while adding custom option.' });
    }
};

// 删除自定义选项
exports.deleteCustomOption = async (req, res) => {
    const { optionId } = req.params;
    const userId = req.user;

    try {
        const success = await CustomOption.delete(optionId, userId);
        if (success) {
            res.status(200).json({ message: 'Custom option deleted successfully.' });
        } else {
            res.status(404).json({ message: 'Custom option not found or unauthorized.' });
        }
    } catch (error) {
        console.error('Delete custom option error:', error);
        res.status(500).json({ message: 'Server error while deleting custom option.' });
    }
};
